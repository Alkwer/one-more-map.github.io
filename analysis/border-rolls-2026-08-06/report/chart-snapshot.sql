-- Portable-report snapshot queries.
-- Upstream calculations are executed by ../analyze.mjs. These statements
-- reproduce the bounded, reviewed rows embedded in artifact.json.

-- slot_family_summary
SELECT * FROM (VALUES
('Waluta / drop walut', 'Góra 2', 7, 1),
('Rarity', 'Prawo 2', 4, 1),
('Scaraby', 'Dół 2', 5, 1),
('Experience', 'Lewo 2', 5, 1)
) AS t(family, expected_position, observed, match_rate)
ORDER BY observed DESC;

-- top_mods
SELECT * FROM (VALUES
(1, 'b-mag-2', '60% Magnitude', 36, 0.0714285714, 28, 16, 20, 16, 0.015625, 42, 504),
(2, 'b-anchor-1', '+2 Anchors', 30, 0.0595238095, 21, 14, 17, 13, 0.015625, 42, 504),
(3, 'b-pack-1', '16% Pack Size', 27, 0.0535714286, 20, 14, 15, 12, 0.015625, 42, 504),
(4, 'b-mag-1', '40% Magnitude', 24, 0.0476190476, 21, 13, 10, 14, 0.015625, 42, 504),
(5, 'b-pack-3', '32% Pack Size', 23, 0.0456349206, 17, 13, 12, 11, 0.015625, 42, 504),
(6, 'b-goldlantern', '+4 Gold Lanterns', 22, 0.0436507937, 18, 17, 13, 9, 0.015625, 42, 504),
(7, 'b-quantconn-1', '120% Qty, -50%/Conn', 22, 0.0436507937, 18, 13, 10, 12, 0.015625, 42, 504),
(8, 'b-keep-1', '30% Keep Charts', 21, 0.0416666667, 18, 14, 11, 10, 0.015625, 42, 504),
(9, 'b-rare-1', '50% Rares', 18, 0.0357142857, 17, 13, 9, 9, 0.015625, 42, 504),
(10, 'b-lanterns', 'Free Lanterns', 17, 0.0337301587, 14, 10, 9, 8, 0.015625, 42, 504)
) AS t(rank, mod_id, label, slots, slot_share, boards, sequences, natural_slots, paid_slots, uniform_benchmark, sample_boards, sample_slots)
ORDER BY rank;

-- evidence_summary
SELECT * FROM (VALUES
(1, 'Pule zależne od pozycji', '21/21 trafień czterech rodzin w przypisanych środkowych segmentach; permutacyjne p < 0,00005', 'Wysoka dla istnienia zależności', 'Używać modelu slot-aware eksperymentalnie'),
(2, 'Duplikaty są dozwolone', '38/42 plansz z dokładnym duplikatem moda', 'Wysoka', 'Nie wymuszać unikalności moda na planszy'),
(3, 'Globalna pula nie jest jednolita', 'Top 8 = 40,7% slotów; równy benchmark dla 8 z 64 = 12,5%', 'Średnia dla dokładnych wag', 'Estymować osobno per slot i wygładzać'),
(4, 'Koszt rerolli', '3k: 21/21; 6k: 12/12; 12k: 9/9', 'Wysoka w obserwowanym zakresie', 'Można komunikować 3k → 6k → 12k'),
(5, 'Naturalny vs płatny', 'Nie wykryto różnicy, p = 0,410; tylko 12 sparowanych sekwencji', 'Niewystarczająca dla równoważności', 'Nadal utrzymywać osobne profile'),
(6, 'Rzadkie i niewidziane mody', '15/64 niewidzianych; Divine 0/42 plansz', 'Niska / prior-only', 'Nie prezentować dokładnych szans jako empirycznych'),
(7, 'Wpływ Vespera', '30 plansz z Vesper 5, 12 z wartością nieznaną; strata zależne od czasu', 'Brak wiarygodnej estymaty', 'Zbierać więcej jawnie oznaczonych poziomów')
) AS t(priority, finding, evidence, confidence, action)
ORDER BY priority;
