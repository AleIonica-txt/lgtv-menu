# Mi Menú: un inicio propio para teles LG webOS rooteadas

> **English summary.** A custom home screen for rooted LG webOS TVs. It replaces LG's Home: you get a
> Dock and an app grid you can reorder, a landscape background that follows the sun with a big clock and the weather, and a
> control center opened with the remote's *Input* button (inputs, audio output, screen off, power
> off). It also includes some memory tuning for TVs with little RAM. It works through Homebrew Channel
> `init.d` scripts and a small root daemon, and nothing is written to the system partition: one
> reboot without the scripts brings LG's Home back. It has only been tested on an LG QNED80T6A with
> webOS 10.3.2. The documentation and code comments are in Spanish.

Mi Menú sustituye el inicio de LG por uno propio, más rápido y sin anuncios:

- **Dock y cuadrícula.** Abajo, un Dock pequeño con tus accesos favoritos (TDT, una entrada HDMI y
  apps); al bajar, todas las apps instaladas. El nombre solo aparece en la tarjeta enfocada. Puedes mover cualquier tarjeta de un sitio a otro desde los ajustes del
  menú. Las apps nuevas aparecen solas al final.
- **Es el Home del sistema.** La tecla Home y la salida de cualquier app llevan a Mi Menú en unos
  0,2 s, sin pasar por el inicio de LG. Desde los ajustes del menú puedes volver al de LG cuando
  quieras.
- **Centro de control** con el botón de fuentes del mando. Flota sobre lo que estés viendo y permite
  cambiar de fuente (TDT o HDMI), elegir la salida de audio, apagar la pantalla o apagar la tele.
  Sustituye al selector de entradas de LG.
- **Paisaje de fondo con la hora en grande**, detrás del relieve, la fecha y el tiempo. El paisaje
  sigue al sol de tu ciudad: amanecer, día, atardecer y noche; de día, niebla si está cubierto.
- **Reposo.** Tras unos minutos sin tocar el mando, el menú se esconde y queda el paisaje con la
  hora. Mientras el menú está delante, no sale el salvapantallas de LG ni su publicidad.
- **Ajustes:** orden de las tarjetas, sonidos, reposo, paisaje, el tiempo, reducir movimiento y qué
  abre la tecla Home.
- **Memoria.** Cierra servicios pesados que se quedan en marcha sin usarse, como el servidor de
  Stremio (~120 MB). También ajusta el gestor de memoria de LG para que las apps que consumen mucha
  memoria no se reinicien al reproducir.
- **Opcional** ([tools/tv-tune.sh](tools/tv-tune.sh)): activa Quick Start+, quita las promociones,
  la publicidad y las recomendaciones de LG, y recorta las precargas de apps. Todo se puede deshacer.

> ⚠️ Solo se ha probado en una **LG QNED80T6A con webOS 10.3.2**. En otros modelos o versiones
> pueden cambiar las rutas, los servicios del sistema o su comportamiento. Úsalo bajo tu
> responsabilidad (ver [Aviso](#aviso)).

## Requisitos

- **La tele, rooteada**, con [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)
  y su servidor SSH activado. Cómo rootearla depende del modelo y del firmware: consulta
  [webosbrew.org](https://www.webosbrew.org/).
- **Acceso por SSH con clave** como `root`. Las herramientas usan `~/.ssh/lgtv`; puedes cambiarla
  con la variable `KEY`.
- **Un PC con Linux** (o algo parecido) con `bash`, `python3`, `ssh`, `tar` y `ar` (de `binutils`).
  No hace falta ares-cli ni el SDK de LG.

## Instalación

Todos los comandos se ejecutan en el PC, desde la carpeta del proyecto.

**1. La IP de la tele.** Conviene reservarle una IP fija en el router.

```sh
cp tv-ip.example tv-ip
nano tv-ip            # pon la IP de tu tele
ssh -i ~/.ssh/lgtv root@$(cat tv-ip) uname -a   # comprueba que entras
```

**2. Iconos, paisajes y lugar.** Los iconos de las apps (marcas) y las fotos de los paisajes
(licencias que piden citar al autor) no se incluyen en el repositorio: cada cual los genera.

```sh
tools/fetch_icons.sh               # copia de tu tele los iconos de las apps del menú (app/icons/)
python3 -I tools/fetch_scenes.py   # descarga los paisajes de Wikimedia Commons (app/scenes/)
```

`fetch_scenes.py` necesita `python3-pil` (Pillow). Sin paisajes, el menú funciona con fondo liso.

Si no tienes alguna app, el script avisa y la tarjeta se verá con su color. Lo mejor es quitar esa
app de `SECTIONS` (ver [Personalizar](#personalizar)).

Después de instalar (paso 3), elige el lugar para el tiempo y para que el paisaje siga al sol:

```sh
tools/weather.sh "Granada"         # o "Granada, ES" si hay varios con ese nombre
```

Solo se guardan el nombre y las coordenadas redondeadas (unos 1 km), y la tele consulta el tiempo
directamente a Open-Meteo. Sin lugar no hay tiempo y el paisaje va por la hora del reloj.

**3. Compilar e instalar las dos apps** (el menú y el centro de control):

```sh
./build.sh install
APP_DIR=control ./build.sh install
```

**4. Activar el arranque automático.** Homebrew Channel ejecuta al encender los scripts de
`/var/lib/webosbrew/init.d` en orden. Tienen que ser ejecutables:

```sh
ssh -i ~/.ssh/lgtv root@$(cat tv-ip) '
D=/media/developer/apps/usr/palm/applications/org.mimenu.tvmenu
I=/var/lib/webosbrew/init.d
mkdir -p $I && chmod +x $D/*.sh
ln -sf $D/homekey.sh   $I/80tvmenu-home      # vigilante (homekey.py) y veto al salvapantallas de LG
ln -sf $D/as-home.sh   $I/85tvmenu-as-home   # monta el menú como Home del sistema
ln -sf $D/autostart.sh $I/90tvmenu           # abre el menú al encender
reboot'
```

Tras el reinicio, Homebrew Channel tarda alrededor de un minuto en ejecutar los scripts. Después,
Mi Menú queda como inicio.

**5. Ajustes de rendimiento (opcional):**

```sh
tools/tv-tune.sh status   # ver cómo está
tools/tv-tune.sh apply    # aplicar (guarda los valores originales en la tele)
tools/tv-tune.sh undo     # volver a los originales
```

Para actualizar después de cambiar algo, basta con volver a ejecutar `./build.sh install`. Ese
comando reinicia el vigilante y refresca la copia del menú como Home.

## Personalizar

Casi todo está al principio de [app/js/main.js](app/js/main.js):

- **`SECTIONS`** son los accesos con tarjeta propia: el id de la app, el nombre, los colores, el
  icono. Para saber el id de una app instalada:
  `tools/luna.sh luna://com.webos.applicationManager/listApps '{}'`.
- **El Fire Stick** es la entrada `com.webos.app.hdmi2` (HDMI 2). Cambia el número si tu aparato va
  en otra entrada.
- **`DOCK_DEFAULT` y `GRID_DEFAULT`** fijan el orden inicial. Después, el orden se cambia desde el
  propio menú: *Ajustes → Reordenar accesos*.
- **Las rutas de los iconos en la tele** están en [tools/fetch_icons.sh](tools/fetch_icons.sh).
- **La gestión de memoria de Stremio** está en [app/homekey.py](app/homekey.py), en
  `HEAVY_SERVICES`, `IDLE_CLOSE_S` y `HUNGRY_APPS`.
- **El lugar del tiempo y del sol** se elige con [tools/weather.sh](tools/weather.sh).
- **Los paisajes** son la lista `SCENES` de [tools/fetch_scenes.py](tools/fetch_scenes.py): dos fotos
  por momento del día (noche, amanecer, día, día cubierto y atardecer), que se alternan por días. El
  script recorta el cielo de cada foto para que la hora quede detrás del relieve, decide dónde va y
  genera [app/js/scenes.js](app/js/scenes.js) con el lugar, el autor y la licencia.

## Desinstalar

1. **Volver al inicio de LG sin desinstalar nada:** en el menú, *Ajustes → La tecla Home abre →
   Volver al inicio de LG*. Para reactivarlo, abre Mi Menú desde las apps de LG y cámbialo en sus
   ajustes.
2. **Quitarlo del todo:**

   ```sh
   tools/tv-tune.sh undo    # solo si aplicaste los ajustes de rendimiento
   ssh -i ~/.ssh/lgtv root@$(cat tv-ip) '
   rm -f /var/lib/webosbrew/init.d/80tvmenu-home /var/lib/webosbrew/init.d/85tvmenu-as-home \
         /var/lib/webosbrew/init.d/90tvmenu
   rm -rf /var/lib/webosbrew/tvmenu-*
   reboot'
   ```

   Después, desinstala *Mi Menú* y *Centro de control* como cualquier otra app.

Ni el montaje del menú como Home ni el filtro de teclas se guardan en disco: con un reinicio sin
los scripts, todo vuelve a ser como lo dejó LG.

## Cómo funciona

| Fichero | Qué hace |
| --- | --- |
| [app/](app/) | El menú (app web: HTML, CSS y JS sin dependencias). `build.sh` junta los JS y el CSS para que arranque antes. |
| [control/](control/) | El centro de control. Es otra app, en una ventana *overlay* transparente sobre la app que esté delante. |
| [app/as-home.sh](app/as-home.sh) | Copia el menú en RAM con la identidad del Home de LG (`com.webos.app.home`), la monta encima con `mount --bind` y reinicia SAM. |
| [app/homekey.py](app/homekey.py) | Vigilante que corre como root. Hace lo que una app web no tiene permiso para hacer (ajustes del sistema, apagar, salida de audio, memoria) y ofrece una API HTTP en `127.0.0.1:45710` para las dos apps. |
| [app/token.sh](app/token.sh) | Crea la clave del servidor local del vigilante y se la deja a las dos apps (ver [Seguridad](#seguridad)). |
| [app/keyfilter.js](app/keyfilter.js) | Filtro de teclas para el gestor de ventanas: el botón de fuentes abre el centro de control. |
| [app/saverveto.js](app/saverveto.js) | Veta el salvapantallas de LG mientras el menú está delante. |
| [app/js/scene.js](app/js/scene.js) | El paisaje de fondo, la hora, la fecha y el tiempo, dibujados en lienzos. |
| [app/autostart.sh](app/autostart.sh) | Abre el menú al encender y deja el centro de control cargado y oculto. |
| [tools/](tools/) | Herramientas para el PC: capturas de pantalla, llamadas a luna, mediciones de arranque, fluidez y memoria. |
| [tests/](tests/) | Pruebas del vigilante en el PC, sin tele: `python3 -I tests/test_homekey.py`. |

### Seguridad

El vigilante corre como root y puede apagar la tele o cambiar el inicio, así que su servidor HTTP
está protegido:

- **Solo escucha en `127.0.0.1`.** No es accesible desde la red de casa.
- **Cada petición lleva una clave.** Aun así, en `127.0.0.1` lo alcanzaría cualquier página abierta
  en la tele (el navegador, la publicidad de una app). Por eso [token.sh](app/token.sh) crea una
  clave aleatoria en la tele (`/var/lib/webosbrew/tvmenu-token`) y la deja en `token.js`, un fichero
  de la carpeta de cada app que una página de fuera no puede cargar. Sin la clave, el vigilante
  responde 403. La clave nunca sale de la tele ni va en el paquete.
- **Lo que llega se comprueba.** Las preferencias tienen que tener la forma esperada y un tamaño
  máximo; los iconos solo se sirven desde las carpetas de apps; las llamadas al sistema se hacen sin
  intérprete de órdenes de por medio.

Queda fuera de este modelo una app instalada en la tele con malas intenciones: cualquier app puede
lanzar el menú con parámetros (así funcionan las pruebas de `tools/launch.sh`), y una app nativa con
root puede hacer lo que quiera. Instala solo apps en las que confíes.

### Caja negra (opcional)

Los registros de la tele (`/var/log`) están en RAM, rotan cada pocos minutos y se borran al
reiniciar. Para investigar un fallo que aparece de vez en cuando, el vigilante puede ir copiándolos
a la flash (`/var/lib/webosbrew/tvmenu-logs/`, los últimos 40 trozos):

```sh
touch /var/lib/webosbrew/tvmenu-blackbox   # activar (en la tele)
rm /var/lib/webosbrew/tvmenu-blackbox      # desactivar
```

Está desactivada por defecto porque escribe en la flash sin parar.

### Cosas que descubrimos por el camino

Por si le ahorran tiempo a alguien que trabaje con webOS:

- **`luna-send` no devuelve nada sin TTY.** En esta tele (al menos), `luna-send` no escribe la
  respuesta si no tiene terminal. Se arregla con `script -qc "luna-send …" /dev/null` o con
  `ssh -tt` y redirigiendo la salida a un fichero. El vigilante le da un pseudoterminal propio
  (`os.openpty`), que ahorra dos procesos por llamada, y vuelve a `script` si así no responde.
- **Reiniciar SAM rompe el vídeo de las apps nativas.** Después de `systemctl restart sam`,
  `umediaserver` pierde su suscripción a SAM (`com.webos.media.appobserver` desaparece de
  `ls-monitor -s`) y no la recupera:
  - la TDT dice «No hay señal» aunque el sintonizador engancha;
  - HDMI y YouTube se ven en negro;
  - las apps web siguen funcionando.

  La solución es reiniciar después `umediaserver` y `memchute`, y parar `captureservice`: está en
  `restart_sam()` de [as-home.sh](app/as-home.sh). LG reinicia la tele de madrugada en reposo, así
  que el fallo solía aparecer por la mañana.
- **El Home de LG no se puede sustituir sin reiniciar SAM.** Su `appinfo.json` original es de tipo
  `flutter`, y SAM no relee el montaje si no se reinicia. Antes de reiniciarlo hay que cerrar la
  página en el gestor de apps web (`com.palm.webappmanager/killApp`); si no, el gestor reutiliza la
  versión vieja.
- **Las teclas simuladas no llegan a las apps web.** Las de `uinput` y `networkinput` no les llegan;
  para probar un botón, la app se lanza con un parámetro (`{"action": …}`).
- **En los filtros de teclas, `KeyPolicy.NextPolicy` es la política correcta.** Pasa la tecla al
  siguiente filtro. `NotAccepted` corta la cadena y la manda directa a la app: dejan de funcionar
  Home y Ajustes. La lista `com.webos.surfacemanager.keyFilters` se cambia en caliente con
  `com.webos.service.config/setConfigs` y no se guarda. Cada cambio obliga a LG a volver a crear
  todos sus filtros, así que conviene no tocarla de más.
- **El veto al salvapantallas tiene que responder por la misma conexión.** `tvpower` pregunta a los
  clientes registrados antes de mostrar su salvapantallas, pero solo atiende la respuesta si llega
  por la conexión con la que se registró el cliente. Por eso el veto va en Node con `palmbus` y no
  con `luna-send`, que abre una conexión por llamada.
- **El gestor de memoria de LG es `memchute`.** Lee su configuración de configd solo al arrancar.
  Las apps de la lista `EfsTarget` pueden llevar la memoria comprimida a la flash en vez de que el
  sistema las reinicie al reproducir. Sin eso, Stremio (unos 330 MB de página y 150 MB de servidor)
  no funcionaba en una tele de 1,2 GB.
- **LG reescribe la lista de precarga.** `preloadmanager` reabre en segundo plano las apps de
  `/var/preferences/webos-preload-manager-conf.json` en cuanto hay memoria libre, y LG va cambiando
  la lista según el uso.
- **Pocos ficheros, arranque más rápido.** En este motor web cada fichero local cuesta unos 100 ms
  al arrancar. Juntar JS y CSS ([tools/bundle.py](tools/bundle.py)) bajó el arranque del menú de
  3,6 s a 1,1 s.

## Créditos

- [zzeppieri/webos-custom-home](https://github.com/zzeppieri/webos-custom-home) y
  [theboringhumane/theboringtv-lgwebos](https://github.com/theboringhumane/theboringtv-lgwebos): la
  idea del servicio de la tecla Home y de montar una app como Home del sistema (`as-home.sh`).
- [webosbrew](https://www.webosbrew.org/): Homebrew Channel, RootMyTV y toda la documentación sobre
  webOS.
- [couch-tv](https://github.com/Seagey/couch-tv) (MIT): la idea de la hora detrás del paisaje y el
  cálculo del sol. La fuente de la hora es Antonio (SIL Open Font Licence).
- Paisajes: fotos destacadas de Wikimedia Commons; el lugar, el autor y la licencia de cada una
  están en [app/js/scenes.js](app/js/scenes.js) y el menú los muestra en reposo.
- El tiempo: [Open-Meteo](https://open-meteo.com/).

## Aviso

Este proyecto no tiene relación con LG Electronics. Rootear la tele y cambiar su sistema puede
anular la garantía o dejarla en un estado raro; úsalo bajo tu responsabilidad. Los nombres y marcas
de las apps (Netflix, YouTube, Disney+…) son de sus dueños, y por eso no se incluyen sus iconos ni
sus logos.

Licencia: [MIT](LICENSE).
