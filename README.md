# SergioCM · Portfolio (tema Wii)

Portfolio personal de **Sergio CM** con la temática del menú de la Wii.

## Canales = proyectos de GitHub

Los canales del menú se generan a partir de los repositorios de GitHub. La
lista vive en `db/projects.json` y se gestiona desde el panel de admin, que se
ejecuta en local:

```bash
node admin/server.js
```

Luego abre <http://localhost:8000/admin/> para sincronizar con GitHub, editar
los canales o desactivarlos, y <http://localhost:8000/> para ver el portfolio.
Los detalles están en [admin/README.md](admin/README.md).

El sitio sigue siendo estático: el panel sólo escribe `db/projects.json`, que
es lo que hay que commitear para que los cambios salgan en producción.

## Créditos / base del proyecto
Este portfolio está construido partiendo de **"Onliine"**, un simulador del menú de la Wii
creado por JerosGamer89 (Ascript89 en GitHub). Puedes ver los créditos completos dentro del
propio sitio, en el canal de Información.

## Licencia
Basado en Onliine Website - Wii System simulator<br>
Copyright (C) 2024 José Enrique<br>
Source original: https://github.com/jerosajose/onliine<br>

Este proyecto es software libre: puedes redistribuirlo y/o modificarlo
bajo los términos de la GNU Affero General Public License publicada por
la Free Software Foundation, ya sea la versión 3 de la licencia o (a tu
elección) cualquier versión posterior.

Se distribuye con la esperanza de que sea útil, pero SIN NINGUNA GARANTÍA.
Más información en [gnu.org/licenses](https://www.gnu.org/licenses/).
