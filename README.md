# SEINCA Enterprise 5

Plataforma local-first para presupuestos y Análisis de Precios Unitarios de construcción, con cálculo determinístico, catálogo trazable de precios, control de aprobación, historial automático, PDF profesional en servidor y comité híbrido OpenAI + Gemini.

## Capacidades activas

- Generación de APU con OpenAI, Gemini o contraste dual.
- Modelos de respaldo en paralelo.
- Cálculo económico independiente de la IA.
- Parámetros de administración, imprevistos, utilidad, financiamiento, impuesto, factor contractual y FCAS editables por proyecto.
- Catálogo de precios con fuente, fecha y condición de verificación.
- Bloqueo de aprobación cuando existen precios cero o no verificados.
- Borradores y partidas aprobadas.
- Confirmación obligatoria de revisión profesional.
- Historial y recuperación local de versiones.
- Importación y exportación de proyectos JSON y presupuesto CSV.
- PDF Letter generado en el servidor, con páginas de continuación, fuentes de precios y hash documental.
- PWA instalable y caché local de la interfaz.
- Pruebas unitarias y validación automática en GitHub Actions.

## Variables de entorno

Copie `.env.example` en la configuración de Vercel. Nunca guarde claves dentro del repositorio.

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `OPENAI_MODELS` opcional
- `GEMINI_MODELS` opcional
- `ALLOWED_ORIGINS`
- `RATE_LIMIT_PER_MINUTE`

## Desarrollo y control de calidad

```bash
npm install
npm run qa
```

## Modelo de seguridad y responsabilidad

La IA propone el APU; el motor determinístico calcula los costos. Una partida no puede aprobarse sin revisión profesional y, cuando la regla está activa, sin precios verificados. Los códigos COVENIN pendientes se muestran como `POR VERIFICAR` y no se presentan como confirmados.

## Límite actual de la edición local-first

La versión 5 protege y versiona proyectos en el navegador y mediante archivos JSON. Para comercialización multiempresa todavía requiere conectar un servicio externo de identidad, base de datos, almacenamiento documental y auditoría central. Esas funciones no se declaran activas hasta que exista infraestructura y credenciales configuradas.
