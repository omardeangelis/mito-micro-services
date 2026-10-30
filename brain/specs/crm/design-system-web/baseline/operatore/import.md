# Import (operatore)

- URL: `/dashboard/import`
- Data: 2026-10-29
- Ruolo: OPERATORE
- Screenshot a 1280 × 800: `import.jpg`
- Nota: OPERATORE non vede il link Import nel menu e, all'indirizzo diretto, vede la pagina "Pagina non trovata" dentro il layout della dashboard (non la pagina Import)

## Scroll orizzontale della finestra

| Viewport | scrollWidth | clientWidth | scrollWidth > clientWidth |
| --- | --- | --- | --- |
| 1280 × 800 | 1280 | 1280 | no |
| 1024 × 768 | 1024 | 1024 | no |

## Capture a 1280 × 800

```json
{
  "url": "/dashboard/import",
  "title": "Mito CRM",
  "headings": [
    "Pagina non trovata"
  ],
  "columns": [],
  "buttons": [
    ""
  ],
  "links": [
    "Mito SRL -> /dashboard/",
    "Home -> /dashboard/",
    "Customers -> /dashboard/customers",
    "Contatti -> /dashboard/contatti",
    "Pratiche -> /dashboard/pratiche",
    "Profile -> /dashboard/profile",
    "Torna alla dashboard -> /dashboard"
  ],
  "fields": [],
  "tabs": [],
  "dialogs": [],
  "text": "Mito SRL\nHome\nCustomers\nContatti\nPratiche\nProfile\nPagina non trovata\nL'indirizzo non corrisponde a nessuna pagina\nTorna alla dashboard",
  "scroll": {
    "viewport": [
      1280,
      800
    ],
    "scrollWidth": 1280,
    "clientWidth": 1280
  }
}
```
