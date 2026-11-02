"""Consume pedidos de ActiveMQ y confirma solo los mensajes validos."""

import argparse
import os
from threading import Event
from typing import Protocol

from formatos import deserializar_pedido


class Conexion(Protocol):
    def ack(self, id: str, subscription: str) -> None: ...

    def nack(self, id: str, subscription: str) -> None: ...


class Frame(Protocol):
    headers: dict[str, str]
    body: str


class EscuchaPedidos:
    def __init__(self, conexion: Conexion) -> None:
        self.conexion = conexion

    def on_message(self, frame: Frame) -> None:
        message_id = frame.headers.get("message-id")
        subscription = frame.headers.get("subscription")
        if not message_id or not subscription:
            print("Mensaje recibido sin identificador o suscripcion; no se puede confirmar.")
            return

        try:
            pedido = deserializar_pedido(frame.body, frame.headers.get("formato"))
        except ValueError as error:
            print(f"Pedido invalido ({message_id}): {error}. Se envia NACK.")
            self.conexion.nack(id=message_id, subscription=subscription)
            return

        print(
            f"Pedido valido: id={pedido.id}, cliente={pedido.cliente}, "
            f"monto={pedido.monto}"
        )
        self.conexion.ack(id=message_id, subscription=subscription)


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Escucha pedidos en ActiveMQ.")
    parser.add_argument("--host", default=os.getenv("ACTIVEMQ_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("ACTIVEMQ_PORT", "61613")))
    parser.add_argument(
        "--cola", default=os.getenv("ACTIVEMQ_QUEUE", "/queue/pedidos"),
        help="Destino STOMP de ActiveMQ.",
    )
    return parser.parse_args()


def main() -> None:
    args = argumentos()
    import stomp

    conexion = stomp.Connection([(args.host, args.port)])
    conexion.set_listener("escucha-pedidos", EscuchaPedidos(conexion))
    conexion.connect(
        username=os.getenv("ACTIVEMQ_USER"),
        passcode=os.getenv("ACTIVEMQ_PASSWORD"),
        wait=True,
    )
    conexion.subscribe(destination=args.cola, id="pedidos", ack="client-individual")
    print(f"Escuchando pedidos en {args.cola}. Presiona Ctrl+C para terminar.")
    try:
        Event().wait()
    except KeyboardInterrupt:
        print("\nCerrando consumidor.")
    finally:
        conexion.disconnect()


if __name__ == "__main__":
    main()
