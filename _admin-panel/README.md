# Admin Panel (outside Follio product)

Operator tooling that sits **beside** the Follio application — not product UI.

## Modules (separate on purpose)

| Module        | Path                 | Status                                    |
| ------------- | -------------------- | ----------------------------------------- |
| **Developer** | `modules/developer/` | Health, test suites, smoke, quick links   |
| **Users**     | `modules/users/`     | Placeholder — user monitoring comes later |

These modules must not import each other. The shell only composes them.

## How to open

1. Be an **Admin** (separate `Admin` table — same as today's `/admin`)
2. Open **[http://localhost:3000/admin/developer](http://localhost:3000/admin/developer)**
   (or use the **Developer** item in the admin sidebar)

On production (follio.me), only signed-in admins can reach `/admin/*`. The public cannot.

## App touch points (thin shims only)

- `app/admin/(dashboard)/developer/page.tsx`
- `app/api/admin/developer/*`
- Admin sidebar reads module nav from `_admin-panel/nav.ts`

Do not put real panel logic under `app/` or `components/`.
