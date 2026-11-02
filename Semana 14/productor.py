"""Publica pedidos en una cola de ActiveMQ usando STOMP."""

import argparse
import os

from formatos import FORMATOS, crear_pedido, serializar_pedido


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Envia un pedido a la cola de ActiveMQ.")
    parser.add_argument("id", help="Identificador del pedido.")
    parser.add_argument("cliente", help="Nombre del cliente.")
    parser.add_argument("monto", help="Monto decimal del pedido.")
    parser.add_argument("formato", choices=FORMATOS, help="Formato del mensaje.")
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

    try:
        pedido = crear_pedido(args.id, args.cliente, args.monto)
        cuerpo = serializar_pedido(pedido, args.formato)
    except ValueError as error:
        raise SystemExit(f"Pedido invalido: {error}") from None

    conexion = stomp.Connection([(args.host, args.port)])
    conexion.connect(
        username=os.getenv("ACTIVEMQ_USER"),
        passcode=os.getenv("ACTIVEMQ_PASSWORD"),
        wait=True,
    )
    try:
        conexion.send(
            destination=args.cola,
            body=cuerpo,
            headers={
                "formato": args.formato,
                "content-type": {
                    "json": "application/json",
                    "xml": "application/xml",
                }.get(args.formato, "text/plain"),
            },
        )
        print(f"Pedido {pedido.id} enviado a {args.cola} en formato {args.formato}.")
    finally:
        conexion.disconnect()


if __name__ == "__main__":
    main()
