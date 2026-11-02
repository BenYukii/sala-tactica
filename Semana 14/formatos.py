"""Serializacion y validacion de pedidos para la cola de mensajeria."""

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
import json
import xml.etree.ElementTree as ET


FORMATOS = ("texto", "fijo", "json", "xml")
ANCHO_ID = 10
ANCHO_CLIENTE = 30
ANCHO_MONTO = 12


@dataclass(frozen=True)
class Pedido:
    id: str
    cliente: str
    monto: Decimal


def crear_pedido(id_pedido: object, cliente: object, monto: object) -> Pedido:
    if not isinstance(id_pedido, str) or not id_pedido.strip():
        raise ValueError("El id debe ser un texto no vacio.")
    if not isinstance(cliente, str) or not cliente.strip():
        raise ValueError("El cliente debe ser un texto no vacio.")
    if "\n" in id_pedido or "\r" in id_pedido or "\n" in cliente or "\r" in cliente:
        raise ValueError("El id y el cliente no pueden contener saltos de linea.")

    try:
        importe = Decimal(str(monto))
    except (InvalidOperation, ValueError):
        raise ValueError("El monto debe ser un numero decimal.") from None
    if not importe.is_finite() or importe < 0:
        raise ValueError("El monto debe ser un numero finito mayor o igual a cero.")

    return Pedido(id_pedido.strip(), cliente.strip(), importe)


def _monto_texto(monto: Decimal) -> str:
    return format(monto, "f")


def serializar_pedido(pedido: Pedido, formato: str) -> str:
    if formato not in FORMATOS:
        raise ValueError(f"Formato no soportado: {formato}")

    monto = _monto_texto(pedido.monto)
    if formato == "texto":
        return f"id={pedido.id}\ncliente={pedido.cliente}\nmonto={monto}"
    if formato == "fijo":
        if len(pedido.id) > ANCHO_ID:
            raise ValueError(f"El id no puede superar {ANCHO_ID} caracteres en formato fijo.")
        if len(pedido.cliente) > ANCHO_CLIENTE:
            raise ValueError(
                f"El cliente no puede superar {ANCHO_CLIENTE} caracteres en formato fijo."
            )
        if len(monto) > ANCHO_MONTO:
            raise ValueError(
                f"El monto no puede superar {ANCHO_MONTO} caracteres en formato fijo."
            )
        return (
            f"{pedido.id:<{ANCHO_ID}}"
            f"{pedido.cliente:<{ANCHO_CLIENTE}}"
            f"{monto:>{ANCHO_MONTO}}"
        )
    if formato == "json":
        return (
            f'{{"id":{json.dumps(pedido.id, ensure_ascii=False)},'
            f'"cliente":{json.dumps(pedido.cliente, ensure_ascii=False)},'
            f'"monto":{monto}}}'
        )

    raiz = ET.Element("pedido")
    ET.SubElement(raiz, "id").text = pedido.id
    ET.SubElement(raiz, "cliente").text = pedido.cliente
    ET.SubElement(raiz, "monto").text = monto
    return ET.tostring(raiz, encoding="unicode")


def _leer_texto(contenido: str) -> Pedido:
    campos: dict[str, str] = {}
    for linea in contenido.splitlines():
        nombre, separador, valor = linea.partition("=")
        if not separador or nombre not in ("id", "cliente", "monto") or nombre in campos:
            raise ValueError("El pedido de texto debe tener id, cliente y monto, una vez cada uno.")
        campos[nombre] = valor
    if set(campos) != {"id", "cliente", "monto"}:
        raise ValueError("El pedido de texto debe tener id, cliente y monto.")
    return crear_pedido(campos["id"], campos["cliente"], campos["monto"])


def _leer_fijo(contenido: str) -> Pedido:
    ancho_total = ANCHO_ID + ANCHO_CLIENTE + ANCHO_MONTO
    if len(contenido) != ancho_total:
        raise ValueError(f"El pedido fijo debe tener exactamente {ancho_total} caracteres.")
    return crear_pedido(
        contenido[:ANCHO_ID].strip(),
        contenido[ANCHO_ID : ANCHO_ID + ANCHO_CLIENTE].strip(),
        contenido[ANCHO_ID + ANCHO_CLIENTE :].strip(),
    )


def _leer_json(contenido: str) -> Pedido:
    def rechazar_constante(valor: str) -> None:
        raise ValueError(f"Constante JSON no valida: {valor}")

    datos = json.loads(
        contenido,
        parse_float=Decimal,
        parse_constant=rechazar_constante,
    )
    if not isinstance(datos, dict) or set(datos) != {"id", "cliente", "monto"}:
        raise ValueError("El JSON debe contener exactamente id, cliente y monto.")
    if not isinstance(datos["id"], str) or not isinstance(datos["cliente"], str):
        raise ValueError("Los campos id y cliente del JSON deben ser textos.")
    if isinstance(datos["monto"], bool) or not isinstance(
        datos["monto"], (int, float, Decimal, str)
    ):
        raise ValueError("El campo monto del JSON debe ser numerico.")
    return crear_pedido(datos["id"], datos["cliente"], datos["monto"])


def _leer_xml(contenido: str) -> Pedido:
    try:
        raiz = ET.fromstring(contenido)
    except ET.ParseError as error:
        raise ValueError(f"XML invalido: {error}") from None
    if raiz.tag != "pedido":
        raise ValueError("La raiz XML debe ser <pedido>.")

    campos: dict[str, str] = {}
    for elemento in raiz:
        if elemento.tag not in ("id", "cliente", "monto") or elemento.tag in campos:
            raise ValueError("El XML solo puede incluir id, cliente y monto una vez.")
        campos[elemento.tag] = elemento.text or ""
    if set(campos) != {"id", "cliente", "monto"}:
        raise ValueError("El XML debe incluir id, cliente y monto.")
    return crear_pedido(campos["id"], campos["cliente"], campos["monto"])


def detectar_formato(contenido: str) -> str:
    inicio = contenido.lstrip()
    if inicio.startswith("{"):
        return "json"
    if inicio.startswith("<"):
        return "xml"
    if len(contenido) == ANCHO_ID + ANCHO_CLIENTE + ANCHO_MONTO:
        return "fijo"
    return "texto"


def deserializar_pedido(contenido: str, formato: str | None = None) -> Pedido:
    formato_detectado = formato or detectar_formato(contenido)
    lectores = {
        "texto": _leer_texto,
        "fijo": _leer_fijo,
        "json": _leer_json,
        "xml": _leer_xml,
    }
    try:
        lector = lectores[formato_detectado]
    except KeyError:
        raise ValueError(f"Formato no soportado: {formato_detectado}") from None
    return lector(contenido)
