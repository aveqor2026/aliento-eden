# Aliento · Afirmaciones

Práctica de respiración en español (Ronda, Calma y Caja). En la pausa aparece una afirmación. Si esa frase es una de las ocho con imagen, el fondo pasa a ser la foto a pantalla completa, con un velo oscuro para que el texto se lea. La primera frase —la del Padre y el Hijo— queda solo en texto: sin rostros sagrados y sin cruces.

Sitio estático. La raíz del repositorio es la app. No hace falta compilar.

## Abrir en este teléfono o computadora

Hace falta un servidor (los módulos no cargan con `file://`).

```bash
python3 -m http.server 8765
```

Luego abre [http://127.0.0.1:8765](http://127.0.0.1:8765).

En el celular, misma red, usa la IP de la computadora y el puerto 8765. Desde el navegador se puede agregar a la pantalla de inicio (PWA).

## Qué hace la pausa

| Frase (texto exacto) | Imagen |
| --- | --- |
| Conozco personalmente al Padre y a Su Hijo Jesucristo; me postro ante Ellos y los abrazo. | Solo texto |
| La Palabra de Dios guía y corrige mi vida; Sus mandamientos marcan mi rumbo. | `images/02-palabra-biblia.jpg` |
| Cada decisión que tomo refleja lo que Dios quiere para cómo vivo en esta tierra. | `images/03-decisiones.jpg` |
| EDÉN ya restaura vidas: cada niño tiene familia y cada adulto mayor dignidad. | `images/04-eden-montanas.jpg` |
| Los recursos que llegan tienen sentido porque sirven a EDÉN y a la voluntad de Dios. | `images/05-recursos-eden.jpg` |
| Construyo al hombre cada mañana; el hombre construye la visión. | `images/06-construyo-leyendo.jpg` |
| Hoy camino en obediencia, paz y fe hacia Ellos y hacia EDÉN. | `images/07-camino-paz.jpg` |
| Mi familia está protegida y yo sirvo con amor donde Dios me puso. | `images/08-familia-esposa.jpg` |
| AVEQOR crece sin depender de mí; yo camino hacia EDÉN. | `images/09-aveqor-crece.jpg` |

Quedan en `images/` para después, sin usarse todavía: `04b-eden-playa.jpg`, `10-casa-oracion-pulpito.jpg`, `11-hospital-ambulancia.jpg`.

Si editas una frase en **Afirmaciones**, la imagen sale solo cuando el texto guardado es idéntico al de la tabla. Una frase nueva se muestra sin foto (no hay imagen rota).

## Hábitos (sync)

Al terminar una sesión con al menos una ronda o ciclo, la app hace POST al webhook que configures. La URL y la clave viven solo en ese teléfono (`localStorage`). No están en este repositorio.

1. Crea la routine webhook «Aliento → hábitos» con el prompt de `PARENT_ROUTINE.md`.
2. Copia **POST to** y **key** desde el panel de la routine.
3. En la app: **Afirmaciones** → **Hábitos (sync)** → pega URL y key → **Guardar sync** → **Probar sync**.

| En la app | En el registro |
| --- | --- |
| 1 pausa o ciclo completado | +1 `respiraciones` |
| 3 pausas en una sesión | `cantidad=3` |

La fecha es el día en America/New_York.

Si el webhook no responde, la sesión queda en cola (`aliento-af-pending-sync`) y se reintenta al abrir o con **Reenviar pendientes**.

## Archivos

`index.html`, `app.js`, `afirmaciones.js`, `sync.js`, `s.css`, `extra.css`, `manifest.json`, `sw.js`, `images/`.
