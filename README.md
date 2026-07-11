# SEINCA Enterprise 6

Plataforma local-first para presupuestos y Análisis de Precios Unitarios de construcción en Venezuela. Cada generación de APU ejecuta obligatoriamente una investigación web de precios en Caracas y una búsqueda de referencias COVENIN antes de devolver el resultado.

## Flujo automático activo

1. OpenAI o Gemini genera el cómputo, rendimiento y recursos de la partida.
2. El mismo proceso debe utilizar búsqueda web en tiempo real con mercado fijo `Caracas, Distrito Capital, Venezuela`.
3. Investiga hasta tres precios comparables por material, equipo y cargo de mano de obra.
4. Solo acepta una URL cuando aparece entre las fuentes citadas por el motor de búsqueda.
5. Calcula la mediana de las cotizaciones utilizables para reducir el efecto de valores extremos.
6. Los precios en bolívares únicamente se convierten con una tasa oficial del BCV citada.
7. Busca códigos, títulos, años, aplicabilidad y fuentes de las normas COVENIN relacionadas.
8. Una referencia COVENIN solo se marca verificada cuando la fuente citada pertenece a SENCAMER, Gaceta Oficial u otro dominio gubernamental venezolano.
9. Un recurso sin precio web respaldado queda con precio cero y bloquea la aprobación; no se conserva silenciosamente una estimación de la IA.

## Motores de investigación

- OpenAI Responses API con `web_search`, ejecución obligatoria y ubicación aproximada Caracas.
- Gemini Interactions API con `google_search` y validación de sus anotaciones de fuente.
- Modelos de respaldo ejecutados en paralelo.
- Contraste entre proveedores cuando OpenAI y Gemini están configurados.

## Capacidades generales

- Cálculo económico determinístico independiente de la IA.
- Administración, imprevistos, utilidad, financiamiento, impuesto, factor contractual y FCAS editables.
- Catálogo de precios con fuente, fecha y condición de verificación.
- Bloqueo de aprobación ante precios cero o no verificados.
- Borradores, partidas aprobadas, revisión profesional e historial local.
- Importación y exportación JSON, CSV y PDF profesional en servidor.
- PWA instalable y pruebas automáticas.

## Criterio de responsabilidad

Una referencia web no equivale a una cotización contractual. SEINCA muestra la fuente y exige revisión profesional. Para cumplimiento literal de una norma, la empresa debe conservar el ejemplar oficial o licenciado; el sistema no reproduce textos protegidos ni inventa cláusulas.

## Variables de entorno

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

## Límite actual de la edición local-first

Los proyectos e historiales residen en el navegador y en archivos JSON. Para comercialización multiempresa todavía se requiere identidad, base de datos, almacenamiento documental y auditoría central.
