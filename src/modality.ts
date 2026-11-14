// Whether the visitor is driving with the keyboard right now. Focus moved by code (entering a section, closing a
// card) should only light things up for keyboard users; `:focus-visible` also matches script focus on a fresh load.
let keyboard = false
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) keyboard = true }, true)
  document.addEventListener('pointerdown', () => { keyboard = false }, true)
}
export const usingKeyboard = (): boolean => keyboard
