# Aliento · Afirmaciones

Práctica de respiración en español (Ronda, Calma y Caja). En la pausa aparece una afirmación, solo en texto: letras claras sobre fondo oscuro. No hay fotos.

Sitio estático. La raíz del repositorio es la app. No hace falta compilar.

## Abrir en este teléfono o computadora

Hace falta un servidor (los módulos no cargan con `file://`).

```bash
python3 -m http.server 8765
```

Luego abre [http://127.0.0.1:8765](http://127.0.0.1:8765).

En el celular, misma red, usa la IP de la computadora y el puerto 8765. Desde el navegador se puede agregar a la pantalla de inicio (PWA).

## Afirmaciones

La primera vez, la pausa usa estas frases de inicio:

1. Conozco personalmente al Padre y a Su Hijo Jesucristo; me postro ante Ellos y los abrazo.
2. La Palabra de Dios guía y corrige mi vida; Sus mandamientos marcan mi rumbo.
3. Cada decisión que tomo refleja lo que Dios quiere para cómo vivo en esta tierra.
4. EDÉN ya restaura vidas: cada niño tiene familia y cada adulto mayor dignidad.
5. Los recursos que llegan tienen sentido porque sirven a EDÉN y a la voluntad de Dios.
6. Construyo al hombre cada mañana; el hombre construye la visión.
7. Hoy camino en obediencia, paz y fe hacia Ellos y hacia EDÉN.
8. Mi familia está protegida y yo sirvo con amor donde Dios me puso.
9. AVEQOR crece sin depender de mí; yo camino hacia EDÉN.

En la app, pulsa **Afirmaciones**. Ahí puedes añadir una frase, cambiar el texto o quitarla. No hay límite de cantidad. Se guardan en este teléfono (`localStorage`, clave `aliento-af-list`) y siguen ahí al recargar o al actualizar la app. Si borras todas, la pausa sigue: solo se ve el tiempo.

La rotación (clave `aliento-af-queue`) recorre la lista actual sin repetir hasta acabarla y después la vuelve a barajar.

**Volver a las frases de inicio** restaura la lista de arriba.

## Hábitos

En **Hábitos** cada persona crea los suyos: cantidad (flexiones), minutos (lectura) o sí/no (oración), con una meta diaria opcional. Al anotar, se ve el total de hoy, de la semana (lunes a domingo), del mes y del año, contra la meta multiplicada por los días de ese periodo.

Si existe un hábito llamado Respiraciones, cada sesión de respiración terminada suma sus rondas o ciclos ese día.

El historial anterior de Ismael se importa una sola vez al entrar con `ismael1000m@gmail.com` (o con **Traer mi historial**).

## Cuentas de Google

Cada persona entra con su cuenta de Google. Solo los correos que Ismael autoriza pueden pasar. Las frases, las sesiones y los hábitos de cada quien se guardan en su cuenta (Firestore) y aparecen al entrar en otro teléfono o computadora. La configuración web del proyecto `aliento-65723` ya está en `firebase-config.js`.

El administrador es `ismael1000m@gmail.com`. Entra y abre **Personas** para agregar o quitar correos. No hace falta cambiar código. Quien no está en la lista ve: no tiene acceso.

La clave del webhook de hábitos no se sube a la nube. Sigue solo en el aparato donde la pegaste.

Pasos que hay que hacer una vez en Firebase (con la cuenta de Google `ismael1000m@gmail.com`):

1. Entra a [Firebase console](https://console.firebase.google.com/) y crea un proyecto, por ejemplo `Aliento`.
2. Agrega una app **Web** (`</>`). No actives Hosting: el sitio sigue en GitHub Pages. Copia el `firebaseConfig`.
3. La app web ya está creada. `firebase-config.js` tiene el `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` y `appId` de `aliento-65723`. El correo `ADMIN_EMAIL` sigue en `ismael1000m@gmail.com`, igual que dentro de `firestore.rules`.
4. Authentication → Sign-in method → **Google** ya está activo.
5. Authentication → Settings → Authorized domains ya incluye `aveqor2026.github.io`.
6. Firestore está en `southamerica-east1`, modo producción.
7. Firestore → Rules → borra lo que haya y pega todo `firestore.rules` → **Publish**. Sin ese paso nadie puede guardar, ni el administrador. Las reglas cubren frases, sesiones, hábitos, la lista de correos y el grupo (solo quien elige compartir).
8. Publica el sitio. Ábrelo, entra con Google usando `ismael1000m@gmail.com`. Las frases que ya estaban en ese teléfono suben a la cuenta. En **Personas** agrega los otros correos.

Para entrar en el iPhone usa Safari o el ícono en la pantalla de inicio. La primera vez hace falta internet.

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

`index.html`, `app.js`, `afirmaciones.js`, `account-data.js`, `cloud.js`, `firebase-config.js`, `firestore.rules`, `firebase.json`, `sync.js`, `s.css`, `extra.css`, `manifest.json`, `sw.js`, `favicon.svg`.
