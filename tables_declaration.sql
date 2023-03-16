CREATE TABLE kategorie
(
    kategoria_id    INT          NULL,
    kategoria_nazwa VARCHAR(255) NULL
);

CREATE TABLE lokalizacje
(
    lokalizacja_id    INT          NULL,
    lokalizacja_nazwa VARCHAR(255) NULL
);

CREATE TABLE podmioty
(
    podmiot_id    INT          NULL,
    podmiot_nazwa VARCHAR(255) NULL
);

CREATE TABLE sprzet
(
    przedmiot_id   INT           NULL,
    nazwa          VARCHAR(255)  NULL,
    kategoria_id   INT           NULL,
    ilosc          INT           NULL,
    lokalizacja_id INT           NULL,
    zdjecie        MEDIUMBLOB    NULL,
    wlasciciel_id  INT           NULL,
    uzytkownik_id  INT           NULL,
    status_id      INT           NULL,
    stan_id        INT           NULL,
    opis           VARCHAR(1023) NULL,
    og_id          INT           NULL
);

CREATE TABLE stany
(
    kategoria_id INT          NULL,
    stan_id      INT          NULL,
    stan_nazwa   VARCHAR(255) NULL
);

CREATE TABLE statusy
(
    status_id    INT          NULL,
    status_nazwa VARCHAR(255) NULL
);

CREATE TABLE users
(
    username         VARCHAR(255) NULL,
    password_hash    VARCHAR(255) NULL,
    czy_admin        TINYINT      NULL,
    data_wygasniecia DATE         NULL
);

CREATE TABLE zdjecia_uszkodzen
(
    zdjecie_id   INT        NULL,
    zdjecie      MEDIUMBLOB NULL,
    przedmiot_id INT        NULL
);


