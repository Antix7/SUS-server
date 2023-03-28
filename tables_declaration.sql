CREATE TABLE kategorie
(
    kategoria_id    INT AUTO_INCREMENT
        PRIMARY KEY,
    kategoria_nazwa VARCHAR(255) NOT NULL
);

CREATE TABLE lokalizacje
(
    lokalizacja_id    INT AUTO_INCREMENT
        PRIMARY KEY,
    lokalizacja_nazwa VARCHAR(255) NOT NULL
);

CREATE TABLE podmioty
(
    podmiot_id    INT AUTO_INCREMENT
        PRIMARY KEY,
    podmiot_nazwa VARCHAR(255) NOT NULL
);

CREATE TABLE stany
(
    kategoria_id INT          NOT NULL,
    stan_id      INT          NOT NULL,
    stan_nazwa   VARCHAR(255) NOT NULL,
    PRIMARY KEY (kategoria_id, stan_id),
    CONSTRAINT stany_kategorie_KategoriaID_fk
        FOREIGN KEY (kategoria_id) REFERENCES kategorie (kategoria_id)
);

CREATE TABLE statusy
(
    status_id    INT AUTO_INCREMENT
        PRIMARY KEY,
    status_nazwa VARCHAR(255) NOT NULL
);

CREATE TABLE sprzet
(
    przedmiot_id   INT AUTO_INCREMENT
        PRIMARY KEY,
    nazwa          VARCHAR(255)  NOT NULL,
    kategoria_id   INT           NOT NULL,
    ilosc          INT           NOT NULL,
    lokalizacja_id INT           NOT NULL,
    zdjecie_path   TEXT          NULL,
    wlasciciel_id  INT           NULL,
    uzytkownik_id  INT           NULL,
    status_id      INT           NOT NULL,
    stan_id        INT           NOT NULL,
    opis           VARCHAR(1023) NULL,
    og_id          INT           NULL,
    CONSTRAINT sprzet_kategorie_KategoriaID_fk
        FOREIGN KEY (kategoria_id) REFERENCES kategorie (kategoria_id),
    CONSTRAINT sprzet_lokalizacje_LokalizacjaID_fk
        FOREIGN KEY (lokalizacja_id) REFERENCES lokalizacje (lokalizacja_id),
    CONSTRAINT sprzet_podmioty_PodmiotID_fk
        FOREIGN KEY (uzytkownik_id) REFERENCES podmioty (podmiot_id),
    CONSTRAINT sprzet_sprzet_przedmiot_id_fk
        FOREIGN KEY (og_id) REFERENCES sprzet (przedmiot_id),
    CONSTRAINT sprzet_statusy_StatusID_fk
        FOREIGN KEY (status_id) REFERENCES statusy (status_id),
    CONSTRAINT sprzet_wlasciciele_WlascicielID_fk
        FOREIGN KEY (wlasciciel_id) REFERENCES podmioty (podmiot_id)
);

CREATE TABLE users
(
    username         VARCHAR(255)         NOT NULL
        PRIMARY KEY,
    password_hash    VARCHAR(255)         NOT NULL,
    czy_admin        TINYINT(1) DEFAULT 0 NOT NULL,
    data_wygasniecia DATE                 NULL
);

CREATE TABLE zdjecia_uszkodzen
(
    zdjecie_id   INT AUTO_INCREMENT
        PRIMARY KEY,
    zdjecie      MEDIUMBLOB NOT NULL,
    przedmiot_id INT        NOT NULL,
    CONSTRAINT zdjecia_uszkodzen_sprzet_PrzedmiotID_fk
        FOREIGN KEY (przedmiot_id) REFERENCES sprzet (przedmiot_id)
);


