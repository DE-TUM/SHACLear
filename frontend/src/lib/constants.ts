import type { PromptMode } from './types';

export const EXAMPLE_SHAPE = `@prefix sh: <http://www.w3.org/ns/shacl#> .
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
    ] .`;

export const PROMPT_MODES: { value: PromptMode; label: string }[] = [
  { value: 'a', label: 'Mode A – Structured' },
  { value: 'b', label: 'Mode B – Fine-Grained' },
  { value: 'c', label: 'Mode C – Baseline' },
];
