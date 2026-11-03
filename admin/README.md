# Panel de proyectos

Genera los canales del portfolio a partir de los repositorios de GitHub, y
permite editarlos y desactivarlos sin tocar código.

```bash
node admin/server.js
```

- Portfolio: <http://localhost:8000/>
- Panel: <http://localhost:8000/admin/>

El servidor sólo escucha en `127.0.0.1`, así que no es accesible desde fuera
de tu equipo. No necesita `npm install`: usa sólo módulos de Node.

## Cómo funciona

El portfolio sigue siendo **100% estático**. El panel no se publica: lo único
que viaja al sitio en producción es el fichero de datos.

```
   GitHub API  ──►  panel de admin  ──►  db/projects.json  ──►  index.html
                    (local)              (se commitea)          (lee y pinta)
```

`index.html` lee `db/projects.json` al cargar y convierte cada proyecto
**activo** en un canal del menú. Si el fichero no se puede leer (por ejemplo al
abrir `index.html` con `file://`), usa los canales de reserva de `js/config.js`.

## Flujo normal

1. Arranca el servidor y abre el panel.
2. **Sincronizar con GitHub** trae tus repos. Los que ya existían conservan tus
   ediciones: sólo se refrescan los datos que vienen de GitHub.
3. Edita lo que quieras y desactiva los que no deban salir.
4. **Guardar** escribe `db/projects.json`.
5. Commitea ese fichero y despliega:

```bash
git add db/projects.json && git commit -m "Actualizar canales del portfolio" && git push
```

Repite el paso 2 cuando crees repos nuevos.

## Qué se puede editar

| Campo | Dónde se ve |
|---|---|
| Título | Etiqueta del canal y título grande de la pantalla Start |
| Descripción | Pantalla Start (al abrir el canal) |
| Enlace al pulsar Start | A dónde lleva el botón **Start** |
| Lenguaje / etiqueta | Insignia del canal |
| Estilo del canal | Aspecto del tile (ver abajo) |
| Color | Fondo y acento del canal |
| Icono de fondo | Marca de agua detrás del título |

Cada campo muestra si su valor viene **de GitHub** o está **editado**. Los
editados tienen un enlace para volver al valor original. El título por defecto
se saca del nombre del repo (`App-tienda-springboot` → `App Tienda Springboot`)
y el enlace apunta a la web del repo si la tiene (campo *homepage*), o al
propio repositorio.

### Estilos

El menú real de la Wii es casi todo canales blancos con el nombre en color y
alguna ilustración, y sólo unos pocos oscuros. Hay **33 estilos**, cada uno
con su escena dibujada en SVG.

**Claros:** Blanco limpio · Horizonte curvo · Rayas diagonales · Cuadrícula de
puntos · Olas · Rejilla en perspectiva · Órbitas · Tarjetas · Rayos · Mosaico ·
Banda de color · Banderola · Montañas · Nubes · Panal · Triángulos · Radar ·
Vinilo · Ventana de app · Confeti · Cuaderno · Galones · Pétalos · Capas
isométricas · Globos

**Oscuros:** Burbujas · Oscuro · Terminal · Estrellas · Aurora · Plano técnico ·
Circuito · Neón

El estilo se asigna solo a partir del nombre del repo, repartiéndolos para que
la rejilla no quede monótona, y siempre sale el mismo para el mismo proyecto.
Si uno no te convence, cámbialo en su desplegable.

> Al añadir o cambiar estilos en `js/projects.js` hay que **reiniciar el
> servidor**: Node carga ese módulo una sola vez, al arrancar. Si no, al
> guardar un estilo nuevo el servidor no lo reconoce y lo rechaza (te avisa
> con un mensaje en vez de descartarlo en silencio).

Los colores de lenguaje de GitHub son apagados para algunos lenguajes (el
marrón de Java, el malva de Kotlin), así que para los patrones y las bandas se
les sube la saturación, y el texto usa una versión oscurecida para que se lea
sobre blanco. El color que eliges en el panel sigue siendo el de referencia.

### Desactivar

El interruptor de cada tarjeta quita el canal del portfolio sin borrar nada:
el proyecto sigue en el panel con sus ediciones intactas, listo para volver a
activarse. Las flechas ▲▼ cambian el orden en el que salen en la rejilla.

### Excluir de la sincronización

Quita el repo del panel y hace que las próximas sincronizaciones no lo vuelvan
a traer (se guarda en `settings.excluded`). Útil para repos de prácticas que no
quieres ni ver en la lista.

## Arte propio

Por defecto los canales usan una plantilla compartida,
`channelart/_project/channel.html`, que se dibuja con el título, el color y el
icono pasados por query string. No hay que crear una carpeta por proyecto.

Si quieres arte hecho a mano para un canal:

1. Crea `channelart/<id-del-canal>/channel.html` (mira
   `channelart/soportemii/` como ejemplo).
2. Opcionalmente añade su música en `assets/channels/<id-del-canal>/audio.mp3`.
3. Marca **Usar arte propio** en la tarjeta del proyecto.

El `<id-del-canal>` es el que aparece en esa misma casilla del panel.

## Límite de la API de GitHub

Sin autenticar, GitHub permite 60 peticiones por hora, de sobra para un uso
normal. Si te quedas corto, o quieres incluir repos privados:

```bash
GITHUB_TOKEN=ghp_xxx node admin/server.js
```

En PowerShell:

```powershell
$env:GITHUB_TOKEN = "ghp_xxx"; node admin/server.js
```

El token sólo se usa para llamar a GitHub desde tu máquina; no se guarda en
`db/projects.json` ni se envía a ninguna otra parte.

## Acceso con login (para dejarlo en un servidor)

En local el panel va sin contraseña: escucha solo en `127.0.0.1`, así que no
lo alcanza nadie más. Para dejarlo corriendo en un servidor (tu Proxmox, por
ejemplo) hay que ponerle contraseña primero:

```bash
node admin/server.js --set-password
```

Pide usuario y contraseña (mínimo 8 caracteres) y guarda un **hash scrypt con
sal** en `admin/auth.json`. La contraseña en claro no se guarda en ningún
sitio. Ese fichero está en `.gitignore`: no lo subas.

Ya con eso, el panel se puede servir a la red:

```bash
node admin/server.js --host 0.0.0.0
```

Si intentas usar `--host` sin haber configurado contraseña, **el servidor se
niega a arrancar** en vez de quedarse abierto a quien pase por ahí.

Para contenedores o systemd, también valen variables de entorno en lugar del
fichero:

```bash
ADMIN_USER=sergio ADMIN_PASSWORD=... node admin/server.js --host 0.0.0.0
```

Qué queda protegido: `/admin/` y toda la API. **El portfolio sigue siendo
público**, que para eso es la web. La sesión es una cookie `HttpOnly` +
`SameSite=Strict` que dura 12 horas y se guarda en memoria, así que al
reiniciar el servidor se cierra sesión. Tras 8 intentos fallidos se bloquea
ese cliente 15 minutos.

### HTTPS

En HTTP plano la contraseña viaja sin cifrar. El servidor te avisa al
arrancar. Ponlo detrás de nginx o Caddy con TLS y arráncalo con
`--behind-proxy`, que marca la cookie como `Secure` y hace caso a
`X-Forwarded-For` para el bloqueo por intentos:

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
}
```

Si no te quieres complicar, otra opción igual de válida es dejarlo en
`127.0.0.1` y entrar por **túnel SSH** desde tu portátil, sin exponer nada:

```bash
ssh -L 8000:localhost:8000 usuario@proxmox
```

Y abres `http://localhost:8000/admin/`. También sirve cualquier VPN
(WireGuard, Tailscale).

## Desplegar en un servidor

Hay dos formas de montarlo, según si quieres poder editar desde fuera de tu PC.

**A. Solo la web (lo más simple).** El servidor web sirve la carpeta tal cual
y el panel lo abres en tu PC cuando toque. Es lo que explica el *Flujo normal*
de arriba: editas, guardas, commiteas `db/projects.json` y despliegas. No
necesitas Node en el servidor.

**B. El panel también en el servidor.** Así editas desde cualquier sitio y los
cambios salen al momento, sin pasar por git. Necesita Node y la contraseña
configurada. Como servicio de systemd:

```ini
[Unit]
Description=Wii Portfolio admin
After=network.target

[Service]
WorkingDirectory=/var/www/wii-portfolio
ExecStart=/usr/bin/node admin/server.js --host 127.0.0.1 --behind-proxy
Environment=GITHUB_TOKEN=ghp_xxx
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

Con la opción B, ojo con una cosa: el panel escribe `db/projects.json` en el
servidor, así que ese fichero deja de venir de git. Si luego despliegas desde
git por encima, te pisas los cambios. O editas solo en el servidor, o solo en
local; mezclar las dos acaba en conflicto.

## Opciones

```bash
node admin/server.js --port 9000           # otro puerto
node admin/server.js --host 0.0.0.0        # escuchar en la red (pide login)
node admin/server.js --behind-proxy        # detrás de nginx/Caddy con HTTPS
node admin/server.js --set-password        # fijar usuario y contraseña
```

En `db/projects.json`, dentro de `settings`:

| Opción | Por defecto | Qué hace |
|---|---|---|
| `includeForks` | `false` | Importar también los forks |
| `includeArchived` | `true` | Importar repos archivados |
| `excludeProfileRepo` | `true` | Ignorar el repo del perfil (el que se llama igual que tu usuario) |
| `excluded` | `[]` | Repos que no se importan nunca |
