# Brand logos

| File                     | Use                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `follio-mark.png`        | **Short logo** — geometric “F” only (square, black background). Prefer this for icons, favicons, extension, avatars. |
| `follio-mark-source.png` | Original cropped short mark (portrait source).                                                                       |
| `follio-icon.png`        | Alias of `follio-mark.png` (legacy path).                                                                            |
| `follio-logo-full.png`   | Full wordmark (F + “Follio”).                                                                                        |

App UI: `components/Logo.tsx` (`showText={false}` → short mark).  
Chrome extension icons: `_extensions/chrome/icons/icon{16,32,48,128}.png` (generated from the short mark).
