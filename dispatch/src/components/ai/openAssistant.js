// Global toggle for the floating "Ask AI" assistant panel.
// Anywhere in the app can call openAIAssistant() to focus the panel.

const OPEN_EVENT = "tipsa:open-ai";
const CLOSE_EVENT = "tipsa:close-ai";

export function openAIAssistant() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function closeAIAssistant() {
  window.dispatchEvent(new Event(CLOSE_EVENT));
}

export function onAIAssistantOpen(handler) {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}

export function onAIAssistantClose(handler) {
  window.addEventListener(CLOSE_EVENT, handler);
  return () => window.removeEventListener(CLOSE_EVENT, handler);
}