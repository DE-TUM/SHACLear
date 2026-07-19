"""Smoke tests for core.shacl_parser."""
from __future__ import annotations

import pytest

from core.shacl_parser import (
    prepare_mode_a,
    prepare_mode_b,
    prepare_mode_c,
    validate_shacl_turtle,
)

EXAMPLE_SHAPE = """\
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:PersonShape
    a sh:NodeShape ;
    sh:targetClass ex:Person ;
    sh:property [
        sh:path ex:name ;
        sh:datatype xsd:string ;
        sh:minCount 1 ;
    ] ;
    sh:property [
        sh:path ex:age ;
        sh:datatype xsd:integer ;
        sh:minInclusive 0 ;
    ] .
"""


def test_validate_accepts_valid_shape() -> None:
    validate_shacl_turtle(EXAMPLE_SHAPE)  # should not raise


def test_validate_rejects_garbage() -> None:
    with pytest.raises(ValueError):
        validate_shacl_turtle("this is not turtle")


def test_mode_a_contains_target_class_and_properties() -> None:
    out = prepare_mode_a(EXAMPLE_SHAPE)
    assert "PersonShape" in out
    assert "Target class: Person" in out
    assert "name" in out
    assert "age" in out


def test_mode_b_returns_list_of_constraints() -> None:
    out = prepare_mode_b(EXAMPLE_SHAPE)
    assert isinstance(out, list)
    assert len(out) >= 3  # name minCount, name datatype, age datatype, age minInclusive
    assert all("PersonShape" in line for line in out)


def test_mode_c_returns_turtle_unchanged() -> None:
    assert prepare_mode_c(EXAMPLE_SHAPE) == EXAMPLE_SHAPE


def test_inverse_path() -> None:
    shape = """\
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .

ex:BookShape a sh:NodeShape ;
    sh:targetClass ex:Book ;
    sh:property [
        sh:path [ sh:inversePath ex:wrote ] ;
        sh:minCount 1 ;
    ] .
"""
    out = prepare_mode_a(shape)
    assert "^wrote" in out


def test_sh_closed() -> None:
    shape = """\
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ex:   <http://example.org/> .

ex:DiagnosisShape a sh:NodeShape ;
    sh:targetClass ex:Diagnosis ;
    sh:closed true ;
    sh:ignoredProperties ( rdfs:label ) ;
    sh:property [
        sh:path ex:category ;
        sh:hasValue "critical" ;
    ] .
"""
    out = prepare_mode_a(shape)
    assert "Closed" in out
    assert "label" in out
