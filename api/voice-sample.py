from http.server import BaseHTTPRequestHandler
import asyncio
import os
import tempfile
from urllib.parse import urlparse, parse_qs

import edge_tts

SAMPLE_TEXT = (
    "En SEINCA entendemos que una buena obra comienza mucho antes de la construcción. "
    "Hoy presentamos Onix quinientos doce: una propuesta integral para transformar "
    "el área exterior de la residencia en un espacio contemporáneo, funcional y cuidadosamente ejecutado. "
    "El proyecto reúne diseño, ingeniería, planificación y control técnico, "
    "con una inversión total de cuarenta y cinco mil novecientos diecisiete dólares con ocho centavos, "
    "IVA incluido, y un plazo estimado de diez a doce semanas."
)

FULL_TEXT = (
    "En SEINCA entendemos que una buena obra comienza mucho antes de la construcción. "
    "Comienza con una idea clara, información confiable y decisiones tomadas en el momento correcto. "
    "Hoy presentamos Onix quinientos doce: una propuesta integral para transformar el área exterior "
    "de la residencia de la Familia Rivas en un espacio contemporáneo, funcional y cuidadosamente ejecutado. "
    "La solución articula el área social cubierta, la parrillera, las superficies, el paisajismo y la iluminación "
    "como un solo conjunto arquitectónico. Cada elemento fue concebido para aportar confort, durabilidad "
    "y una experiencia de uso coherente durante el día y la noche. "
    "El proyecto reúne diseño arquitectónico, ingeniería, planificación y control técnico. "
    "La documentación conecta la intención visual con la manera real de construirla, medirla, presupuestarla y aprobarla. "
    "El presupuesto está organizado en cuarenta y ocho partidas, respaldadas por análisis de precios unitarios "
    "y cómputos métricos trazables. El expediente incorpora memoria descriptiva, informe técnico, planos, "
    "selección de acabados y documentos de aceptación. "
    "La ejecución se planifica en un plazo estimado de diez a doce semanas. La secuencia comprende validación y procura, "
    "demoliciones y fundaciones, fabricación y montaje estructural, cubierta e instalaciones, superficies y acabados, "
    "pruebas y entrega. "
    "Antes de iniciar se deben cerrar decisiones clave: acabados y materiales; medidas, niveles y condiciones reales; "
    "ingeniería de detalle y planos de taller; equipos y requerimientos eléctricos; fecha de inicio y condiciones comerciales. "
    "La inversión total de la propuesta es de cuarenta y cinco mil novecientos diecisiete dólares con ocho centavos, IVA incluido. "
    "Onix quinientos doce no es solamente una imagen atractiva. Es una propuesta técnicamente organizada, "
    "económicamente trazable y preparada para avanzar hacia contratación y ejecución. "
    "SEINCA. Ingeniería, control y calidad para llevar el proyecto del concepto a la realidad."
)

VOICE = "es-VE-SebastianNeural"
RATE = "-8%"
PITCH = "-2Hz"
VOLUME = "+0%"

async def render_voice(path: str, text: str) -> None:
    await edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH, volume=VOLUME).save(path)

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        temp_path = None
        try:
            query = parse_qs(urlparse(self.path).query)
            full = query.get("full", ["0"])[0] == "1"
            text = FULL_TEXT if full else SAMPLE_TEXT
            filename = "SEINCA_Onix_512_Narracion_Completa_V16.mp3" if full else "SEINCA_Onix_512_Muestra_Voz_Natural.mp3"
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_file:
                temp_path = temp_file.name
            asyncio.run(render_voice(temp_path, text))
            with open(temp_path, "rb") as audio_file:
                audio = audio_file.read()
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(audio)))
            self.send_header("Content-Disposition", f'inline; filename="{filename}"')
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(audio)
        except Exception as exc:
            message = f"No fue posible generar la narración: {exc}".encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
