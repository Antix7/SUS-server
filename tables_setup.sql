DELETE FROM lokalizacje;
DELETE FROM statusy;
DELETE FROM podmioty;
DELETE FROM kategorie;
DELETE FROM stany;

INSERT INTO lokalizacje VALUES (1, 'Zielonka');
INSERT INTO lokalizacje VALUES (2, '1 Sierpnia');
INSERT INTO lokalizacje VALUES (3, 'Tajny 3. magazyn');
INSERT INTO lokalizacje VALUES (4, 'Dom Basi');
INSERT INTO lokalizacje VALUES (5, 'Nieznana Lokalizacja');

INSERT INTO statusy VALUES (1, 'Dostępny');
INSERT INTO statusy VALUES (2, 'W użyciu');
INSERT INTO statusy VALUES (3, 'Wypożyczony');
INSERT INTO statusy VALUES (4, 'W naprawie');
INSERT INTO statusy VALUES (5, 'Zgubiony');

INSERT INTO podmioty VALUES (1, '174 WDH-y "Wilki"');
INSERT INTO podmioty VALUES (2, '178 WDH-ek "Ognisty Krąg"');
INSERT INTO podmioty VALUES (3, '151 WGZ "Smocze Stowarzyszenie"');
INSERT INTO podmioty VALUES (4, '151 WDSh "Enigma"');
INSERT INTO podmioty VALUES (5, '151 WDW "A co może pójśc źle?"');
INSERT INTO podmioty VALUES (6, 'Szczep Burza');

INSERT INTO kategorie VALUES (1, 'Narzędzia');
INSERT INTO stany VALUES (1, 1, 'Dobry');
INSERT INTO stany VALUES (1, 2, 'Tępy');
INSERT INTO stany VALUES (1, 3, 'Krzywy');
INSERT INTO stany VALUES (1, 4, 'Zardzewiały');
INSERT INTO stany VALUES (1, 5, 'Zły');

INSERT INTO kategorie VALUES (2, 'Namioty');
INSERT INTO stany VALUES (2, 2, 'Dobry');
INSERT INTO stany VALUES (2, 6, 'Łatany');
INSERT INTO stany VALUES (2, 7, 'Dziurawy');
INSERT INTO stany VALUES (2, 8, 'Zapleśniały');
INSERT INTO stany VALUES (2, 10, 'Zły');

INSERT INTO kategorie VALUES (3, 'Stelaże');
INSERT INTO stany VALUES (3, 2, 'Dobry');
INSERT INTO stany VALUES (3, 3, 'Krzywy');
INSERT INTO stany VALUES (3, 9, 'Szyszka?');
INSERT INTO stany VALUES (3, 10, 'Zły');

INSERT INTO kategorie VALUES (4, 'Program');
INSERT INTO stany VALUES (4, 1, 'Nowy');
INSERT INTO stany VALUES (4, 11, 'Używany');

INSERT INTO kategorie VALUES (5, 'Obrzędowość');
INSERT INTO stany VALUES (5, 1, 'Nowy');
INSERT INTO stany VALUES (5, 11, 'Używany');

INSERT INTO kategorie VALUES (6, 'Meble');
INSERT INTO stany VALUES (6, 2, 'Dobry');
INSERT INTO stany VALUES (6, 10, 'Zły');

INSERT INTO kategorie VALUES (7, 'Dokumenty');
INSERT INTO stany VALUES (7, 2, 'Dobry');
INSERT INTO stany VALUES (7, 10, 'Zły');

INSERT INTO kategorie VALUES (8, 'Ubrania');
INSERT INTO stany VALUES (8, 1, 'Nowy');
INSERT INTO stany VALUES (8, 11, 'Używany');

INSERT INTO kategorie VALUES (9, 'Gastronomia');
INSERT INTO stany VALUES (9, 1, 'Nowy');
INSERT INTO stany VALUES (9, 11, 'Używany');

INSERT INTO kategorie VALUES (10, 'Inne');
INSERT INTO stany VALUES (10, 2, 'Dobry');
INSERT INTO stany VALUES (10, 10, 'Zły');