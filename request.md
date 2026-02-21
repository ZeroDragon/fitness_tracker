Vamos a crear un sitio nuevo en este repositorio.
El sitio se llamará "Fitness Tracker"
Será una SPA sencilla con minima reactividad, solo lo necesario. Usando vue.js.
No quiero webpack, no quiero tener que hacer builds, el sitio que vemos es lo que se despliega en un nginx

El sitio tendrá de inicio una sección:

## Glucose tracker.
En esta sección se presentará un listado de glucosa con una gráfica de línea, la cual presentará los datos obtenidos del endpoint /events. Más info en el README.md

En la gráfica tendremos una "sweet zone" marcada con un background verde la cual va desde los 60 a los 180 mg/dL
en el eje horizontal tendremos las horas
En el eje vertical la glucosa
Los elementos del endpoint para llenar esta gráfica son de tipo glucose_reading

En el endpoint también vemos otros eventos como gym, medicine, food. Estos eventos se deben presentar en la gráfica como un keyframe para que cuando el usuario le de click, se pueda ver el detalle.

El endpoint recibe un parámetro opcional de fecha, así que la gráfica debe poder tener un selector de fecha. Este selector obtiene los datos del endpoint y los reemplaza a los actuales para re-poblar el chart. También un paginador para ir cambiando día por día

# Estilo
El sitio debe ser en un tema oscuro estilo tokyo night. Crear una paleta de colores con variables de CSS para poderlas ajustar con facilidad posteriormente.

El sitio debe ser 100% responsivo mobile first
