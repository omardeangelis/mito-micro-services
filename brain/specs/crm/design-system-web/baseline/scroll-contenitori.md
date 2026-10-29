# Contenitori con scroll orizzontale interno

- Data: 2026-10-29
- Serve ad AC25: a 1024 × 768 e a 1280 × 800 la finestra non scorre in orizzontale (vedi la tabella degli scroll in ogni pagina: `scrollWidth` = `clientWidth` ovunque), mentre le tabelle larghe scorrono nel loro contenitore. Questa tabella dice quali contenitori scorrono oggi e di quanto.
- Misura: ogni elemento visibile con `overflow-x` `auto` o `scroll` il cui `scrollWidth` supera il `clientWidth`, dopo `wait --load networkidle`. Larghezze in pixel.
- `tabella` è il `div` `relative w-full overflow-x-auto` che avvolge la tabella; `layout` è il `div` `dashbaord-layout` (il nome è scritto così nel codice), cioè il contenitore del contenuto di pagina.

| Ruolo | Pagina | 1280 × 800 | 1024 × 768 |
| --- | --- | --- | --- |
| ADMIN | `/dashboard` | nessuno | tabella 787 / 670 |
| ADMIN | `/dashboard/customers` | layout 1106 / 992; tabella 2583 / 958 | layout 1106 / 736; tabella 2583 / 702 |
| ADMIN | `/dashboard/contatti` | tabella 1579 / 958 | tabella 1579 / 702 |
| ADMIN | `/dashboard/pratiche` | tabella 1223 / 926 | layout 725 / 704; tabella 1223 / 670 |
| ADMIN | `/dashboard/import` | tabella 1394 / 928 | tabella 1394 / 672 |
| ADMIN | `/dashboard/profile?tab=admin` | nessuno | nessuno |
| ADMIN | `/dashboard/profile?tab=blacklist` | nessuno | nessuno |
| OPERATORE | `/dashboard` | nessuno | tabella 787 / 670 |
| OPERATORE | `/dashboard/customers` | layout 1106 / 992; tabella 2433 / 958 | layout 1106 / 736; tabella 2433 / 702 |
| OPERATORE | `/dashboard/contatti` | tabella 1579 / 958 | tabella 1579 / 702 |
| OPERATORE | `/dashboard/pratiche` | tabella 1223 / 926 | layout 725 / 704; tabella 1223 / 670 |

Formato delle celle: `scrollWidth / clientWidth`.

Il `layout` che scorre da solo (lista Customers a entrambe le larghezze, lista Pratiche a 1024) è oggi così: nella lista Customers la barra dei filtri esce dal contenitore e il pulsante "File" è tagliato nello screenshot a 1280 (`admin/customers-list.jpg`).

Non misurati qui: le pagine di dettaglio, `new`, `connect`, `login`, le 404 e i dialoghi. Per queste pagine vale solo la regola della finestra, già nelle tabelle di ogni file.
