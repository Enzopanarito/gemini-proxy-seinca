from http.server import BaseHTTPRequestHandler
import asyncio
import os
import tempfile

import edge_tts

TEXT = (
    "En SEINCA entendemos que una buena obra comienza mucho antes de la construcción. "
    "Hoy presentamos Onix quinientos doce: una propuesta integral para transformar "
    "el área exterior de la residencia en un espacio contemporáneo, funcional y cuidadosamente ejecutado. "
    "El proyecto reúne diseño, ingeniería, planificación y control técnico, "
    "con una inversión total de cuarenta y cinco mil novecientos diecisiete dólares con ocho centavos, "
    "IVA incluido, y un plazo estimado de diez a doce semanas."
)

VOICE = "es-VE-SebastianNeural"
RATE = "-8%"
PITCH = "-2Hz"
VOLUME = "+0%"


async def render_voice(path: str) -> None:
    communicate = edge_tts.Communicate(
        TEXT,
        VOICE,
        rate=RATE,
        pitch=PITCH,
        volume=VOLUME,
    )
    await communicate.save(path)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_file:
                temp_path = temp_file.name

            asyncio.run(render_voice(temp_path))

            with open(temp_path, "rb") as audio_file:
                audio = audio_file.read()

            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(audio)))
            self.send_header("Content-Disposition", 'inline; filename="SEINCA_Onix_512_Muestra_Voz_Natural.mp3"')
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(audio)
        except Exception as exc:
            message = f"No fue posible generar la muestra de voz: {exc}".encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
