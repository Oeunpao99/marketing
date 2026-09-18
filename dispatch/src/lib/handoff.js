// Carries a picked/generated asset from the AI agent page to the New Post page.
let asset = null

export const handoff = {
  set: (a) => {
    asset = a
  },
  take: () => {
    const a = asset
    asset = null
    return a
  },
  peek: () => asset,
}
