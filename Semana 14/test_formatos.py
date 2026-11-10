import unittest
from decimal import Decimal
from dataclasses import dataclass
import os
import sys
from types import SimpleNamespace
from typing import TypedDict
from unittest.mock import patch

from consumidor import EscuchaPedidos, Frame
from formatos import Pedido, deserializar_pedido, serializar_pedido
import productor


class MensajeEnviado(TypedDict):
    destination: str
    body: str
    headers: dict[str, str]


@dataclass
class FrameFalso:
    headers: dict[str, str]
    body: str


class ConexionFalsa:
    def __init__(self) -> None:
        self.confirmaciones: list[tuple[str, str, str]] = []

    def ack(self, id: str, subscription: str | None = None) -> None:
        self.confirmaciones.append(("ack", id, subscription or ""))

    def nack(self, id: str, subscription: str | None = None) -> None:
        self.confirmaciones.append(("nack", id, subscription or ""))


class ConexionProductorFalsa:
    instancias: list["ConexionProductorFalsa"] = []

    def __init__(self, hosts: list[tuple[str, int]]) -> None:
        self.hosts = hosts
        self.enviados: list[MensajeEnviado] = []
        self.conexion: dict[str, object] = {}
        self.cerrada = False
        self.__class__.instancias.append(self)

    def connect(self, **kwargs: object) -> None:
        self.conexion = kwargs

    def send(self, destination: str, body: str, headers: dict[str, str]) -> None:
        self.enviados.append({
            "destination": destination,
            "body": body,
            "headers": headers,
        })

    def disconnect(self) -> None:
        self.cerrada = True


class FormatosTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pedido = Pedido("1042", "Ana & Tomás", Decimal("125.50"))

    def test_round_trip_en_los_cuatro_formatos(self) -> None:
        for formato in ("texto", "fijo", "json", "xml"):
            with self.subTest(formato=formato):
                contenido = serializar_pedido(self.pedido, formato)
                self.assertEqual(deserializar_pedido(contenido, formato), self.pedido)

    def test_detecta_formato_sin_encabezado(self) -> None:
        for formato in ("texto", "fijo", "json", "xml"):
            with self.subTest(formato=formato):
                contenido = serializar_pedido(self.pedido, formato)
                self.assertEqual(deserializar_pedido(contenido), self.pedido)

    def test_rechaza_pedidos_invalidos(self) -> None:
        casos = (
            ("id=x\ncliente=Ana", "texto"),
            ('{"id":"x","cliente":"Ana","monto":-1}', "json"),
            ("<pedido><id>x</id></pedido>", "xml"),
            ("formato incorrecto", "desconocido"),
        )
        for contenido, formato in casos:
            with self.subTest(contenido=contenido):
                with self.assertRaises(ValueError):
                    deserializar_pedido(contenido, formato)

    def test_formato_fijo_rechaza_campos_demasiado_largos(self) -> None:
        pedido = Pedido("identificador-largo", "Ana", Decimal("1"))
        with self.assertRaises(ValueError):
            serializar_pedido(pedido, "fijo")

    def test_consumer_confirma_pedido_valido(self) -> None:
        conexion = ConexionFalsa()
        frame: Frame = FrameFalso(
            headers={"message-id": "msg-1", "subscription": "pedidos", "formato": "json"},
            body=serializar_pedido(self.pedido, "json"),
        )

        EscuchaPedidos(conexion).on_message(frame)

        self.assertEqual(conexion.confirmaciones, [("ack", "msg-1", "pedidos")])

    def test_consumer_rechaza_pedido_invalido(self) -> None:
        conexion = ConexionFalsa()
        frame: Frame = FrameFalso(
            headers={"message-id": "msg-2", "subscription": "pedidos", "formato": "json"},
            body='{"id":"x","cliente":"Ana","monto":-1}',
        )

        EscuchaPedidos(conexion).on_message(frame)

        self.assertEqual(conexion.confirmaciones, [("nack", "msg-2", "pedidos")])

    def test_productor_publica_el_pedido_con_su_formato(self) -> None:
        ConexionProductorFalsa.instancias.clear()
        modulo_stomp = SimpleNamespace(Connection=ConexionProductorFalsa)
        variables = {"ACTIVEMQ_USER": "usuario", "ACTIVEMQ_PASSWORD": "secreto"}
        argumentos = ["productor.py", "1042", "Ana", "125.50", "json"]

        with (
            patch.dict(sys.modules, {"stomp": modulo_stomp}),
            patch.dict(os.environ, variables, clear=True),
            patch.object(sys, "argv", argumentos),
        ):
            productor.main()

        conexion = ConexionProductorFalsa.instancias[-1]
        self.assertEqual(conexion.conexion, {
            "username": "usuario",
            "passcode": "secreto",
            "wait": True,
        })
        self.assertEqual(len(conexion.enviados), 1)
        mensaje = conexion.enviados[0]
        self.assertEqual(mensaje["destination"], "/queue/pedidos")
        self.assertEqual(mensaje["headers"]["formato"], "json")
        self.assertEqual(
            deserializar_pedido(mensaje["body"], "json"),
            Pedido("1042", "Ana", Decimal("125.50")),
        )
        self.assertTrue(conexion.cerrada)


if __name__ == "__main__":
    unittest.main()
