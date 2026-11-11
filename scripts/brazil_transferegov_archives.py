"""Bounded streaming for a pinned, one-table Transferegov archive."""

from contextlib import contextmanager
from csv import DictReader, field_size_limit
from decimal import Decimal
from hashlib import sha256
from io import TextIOWrapper
import re
from tempfile import TemporaryFile
from urllib.request import Request, urlopen
from zipfile import ZipFile

ARCHIVE_BASE = 'https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov'
field_size_limit(1_000_000)


def cnpj(value):
    if not re.fullmatch(r'[0-9./-]+', value):
        return None
    digits = re.sub(r'[^0-9]', '', value)
    if len(digits) != 14 or len(set(digits)) == 1:
        return None
    for offset, weights in (
        (12, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)),
        (13, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)),
    ):
        remainder = sum(int(digit) * weight for digit, weight in zip(digits, weights)) % 11
        if int(digits[offset]) != (0 if remainder < 2 else 11 - remainder):
            return None
    return digits


def exact_cents(value):
    if value in ('', '-', 'NA'):
        return None
    if not re.fullmatch(r'[0-9]+(?:,[0-9]{1,2}0*)?', value):
        raise ValueError('Unexpected BRL token in the selected source rows.')
    amount = Decimal(value.replace(',', '.')) * 100
    if amount != amount.to_integral_value() or amount > 2**53 - 1:
        raise ValueError('Amount cannot be represented as exact browser cents.')
    return int(amount)


@contextmanager
def verified_rows(name, directory, archive_receipt):
    size, digest, count = archive_receipt
    url = f'{ARCHIVE_BASE}/{name}.zip'
    checksum = sha256()
    downloaded = 0
    response = ((directory / (name + '.zip')).open('rb') if directory
                else urlopen(Request(url, headers={'Accept-Encoding': 'identity'}), timeout=45))
    with response as source, TemporaryFile() as spool:
        while chunk := source.read(1_048_576):
            downloaded += len(chunk)
            if downloaded > size:
                raise ValueError(f'{name}: archive exceeds the pinned size.')
            checksum.update(chunk)
            spool.write(chunk)
        if downloaded != size or checksum.hexdigest() != digest:
            raise ValueError(f'{name}: unexpected archive fingerprint.')
        with ZipFile(spool) as archive:
            member = name + '.csv'
            if archive.namelist() != [member]:
                raise ValueError(f'{name}: unexpected archive members.')

            def rows():
                with TextIOWrapper(archive.open(member), encoding='utf-8-sig',
                                   errors='surrogateescape', newline='') as stream:
                    coordinate = 0
                    for coordinate, record in enumerate(DictReader(stream, delimiter=';'), 1):
                        yield coordinate, record
                    if coordinate != count:
                        raise ValueError(f'{name}: unexpected record count.')

            yield rows


