FREESTYLE Site
====================

Este es un sitio para mostrar las lecturas de glucosa del Zero.

Usa como fuente de datos de glucosa el endpoint de n8n en

GET https://n8n.floresbenavides.com/webhook/events
no requiere auth

Response:
```json
[
  {
    "type": "glucose_reading",
    "desc": "75",
    "timestamp": "2026-02-20T05:57:09.000Z"
  },
  {
    "type": "glucose_reading",
    "desc": "77",
    "timestamp": "2026-02-20T06:12:12.000Z"
  }
]
```

type puede ser glucose_reading, food, gym, medicine
desc puede traer la lectura del glucómetro en el caso de glucose_reading, food, gym y medicine es un texto
timestamp trae la fecha del evento, ya está localizado a la hora local, no hace falta hacer offset

el endpoint tiene un query opcional `?date=YYYY-MM-DD`, si no se pone, se toma la fecha actual por default
