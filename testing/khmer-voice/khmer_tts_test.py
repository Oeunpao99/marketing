"""Listening test: the same Khmer lines read by open-source Khmer TTS models
(Meta MMS and a fine-tune of it) and by Azure Speech (what ContentFlow uses).
Writes WAV/MP3 files to the output folder given as argv[1]."""
import sys
import time
from pathlib import Path

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
env_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None

LINES = {
    "1-everyday": "សួស្តីបង! ថ្ងៃនេះហាងយើងមានទំនិញថ្មីៗជាច្រើន សូមអញ្ជើញមកមើល។",
    "2-number-price": "តម្លៃត្រឹមតែ ៨០ ដុល្លារ ក្នុងមួយខែ ហើយបើកបម្រើ ២៤ ម៉ោង។",
    "3-english-brand": "Chumnouykar AI ឆ្លើយសារភ្ញៀវលើ Facebook និង Telegram ភ្លាមៗ។",
    "4-long-story": "ភ្ញៀវផ្ញើសារម៉ោងពីរយប់ តើបងឆ្លើយទាន់ទេ? បើមិនទាន់ ពួកគេនឹងទៅទិញនៅហាងផ្សេងហើយ។",
}


def run_vits(model_id: str, tag: str) -> None:
    import scipy.io.wavfile
    import torch
    from transformers import AutoTokenizer, VitsModel

    t0 = time.time()
    model = VitsModel.from_pretrained(model_id)
    tok = AutoTokenizer.from_pretrained(model_id)
    print(f"{tag}: loaded in {time.time() - t0:.1f}s, sample rate {model.config.sampling_rate}")
    for name, text in LINES.items():
        torch.manual_seed(7)
        inputs = tok(text, return_tensors="pt")
        t0 = time.time()
        with torch.no_grad():
            wav = model(**inputs).waveform[0].numpy()
        secs = len(wav) / model.config.sampling_rate
        path = out / f"{name}__{tag}.wav"
        scipy.io.wavfile.write(path, model.config.sampling_rate, wav)
        print(f"  {path.name}: {secs:.1f}s audio, made in {time.time() - t0:.2f}s")


def run_azure() -> None:
    import azure.cognitiveservices.speech as sdk

    env = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    cfg = sdk.SpeechConfig(subscription=env["AZURE_SPEECH_KEY"], region=env["AZURE_SPEECH_REGION"])
    cfg.set_speech_synthesis_output_format(sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3)
    cfg.speech_synthesis_voice_name = "km-KH-SreymomNeural"
    synth = sdk.SpeechSynthesizer(speech_config=cfg, audio_config=None)
    print("azure-sreymom:")
    for name, text in LINES.items():
        r = synth.speak_text_async(text).get()
        path = out / f"{name}__azure-sreymom.mp3"
        path.write_bytes(r.audio_data)
        print(f"  {path.name}: {len(r.audio_data)} bytes")


if __name__ == "__main__":
    which = sys.argv[3] if len(sys.argv) > 3 else "all"
    if which in ("all", "mms"):
        run_vits("facebook/mms-tts-khm", "mms-meta")
    if which in ("all", "ft"):
        run_vits("khmerttsopensource/khmer-tts", "mms-finetuned")
    if which in ("all", "azure") and env_path:
        run_azure()
