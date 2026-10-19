# Memory: Circuit SAT — card

load: GYM scene id `circuit-sat` · 2D · source site/vendor/frqtl-web/0.6.0/dist/frqtl/scenes/circuit-sat.js

tile: A half-adder settles on its own answer. No search algorithm runs.

## What you are seeing

What you are seeing: A half-adder settles on its own answer, you are watching electricity simulated in a circuit component live in your browser tab. Quanta (electrons or photons if you like) flow down the wires into two gates; with input A on, the SUM line fills with flowing quanta and nothing flows along CARRY. No search algorithm runs.

## Why it is thought to be classically impossible

Why it is impossible the usual way: Circuit satisfiability, the canonical P vs NP problem of computer science, is also a physical question about real circuits. Every modern circuit is built out of half-adders - put some constant number C of half-adders together and if simulating one is polynomial then C × polynomial is still polynomial. No polynomial-time algorithm is supposed to exist, so the usual way to find an input that satisfies a circuit is to search for one. The EGPT proofs, machine-checked in Lean, show that P=NP.

## How FRQTL gets it

How FRQTL gets it: Two logic gates, the wires between them and an emitter on each input - the half-adder electrical circuit simulation settles in your browser in polynomial time, effectively at once. A gate opens only when its inputs carry the pattern it stands for, so the circuit settles into its answer. Independent cellular automata, no equations. EGPT conceptually holds computer science and physics are linked by P=NP and the principle of least action - that is, everything in reality is efficiently computable. The Lean RET, the derivation of EntropyReal from an IIDParticleSource, and the P=NP capstones are modern formalizations of proofs and ideas advanced by Gian-Carlo Rota circa the late 1970s. The EGPT Lean proofs transparently show the most rigorously advanced proofs ever offered for bridging not only quantum and classical mechanics but mathematics and all the other sciences. Watch the answer emerge with no search, read the code, and judge for yourself whether this is true P=NP quantum computing.

Controls: It starts with input A on. Click the input A and input B toggles (bottom left) to switch each input on or off. Read the two outputs on the right: the top one is SUM (A xor B), the bottom one is CARRY (A and B). An output with quanta flowing along it reads 1; an empty one reads 0.

## The tile still

Tile still (tick 300): A circuit of blue bars on black; two lit input lines on the left feed two gates, the top output line carries a long stream of orange beads to the right, and the bottom output holds only a short, stalled cluster.

## The rung

Rung Circuit SAT: Half-Adder (Impossible things): Two laser inputs drive rail traces into an XOR gate (SUM) and an AND gate (CARRY). A gate's valve opens only when its two input ammeters read its logic, so the circuit settles onto the half-adder's answer, read as the current on each grounded readout. No search algorithm runs.

## What Maxi has learned since

This card is the registry's text, rewritten from it on every run. What Maxi learns in this scene is not added here: it is circuit-sat-seen.md, and each Record memory that INDEX.md lists under "Record memories" with scene `circuit-sat`.
