CREATE TABLE sus_database.kategorie
(
    kategoria_id    INT AUTO_INCREMENT
        PRIMARY KEY,
    kategoria_nazwa VARCHAR(255) NOT NULL
);

CREATE TABLE sus_database.lokalizacje
(
    lokalizacja_id    INT AUTO_INCREMENT
        PRIMARY KEY,
    lokalizacja_nazwa VARCHAR(255) NOT NULL
);

CREATE TABLE sus_database.podmioty
(
    podmiot_id    INT AUTO_INCREMENT
        PRIMARY KEY,
    podmiot_nazwa VARCHAR(255) NOT NULL
);

CREATE TABLE sus_database.stany
(
    kategoria_id INT          NOT NULL,
    stan_id      INT          NOT NULL,
    stan_nazwa   VARCHAR(255) NOT NULL,
    PRIMARY KEY (kategoria_id, stan_id),
    CONSTRAINT stany_kategorie_KategoriaID_fk
        FOREIGN KEY (kategoria_id) REFERENCES sus_database.kategorie (kategoria_id)
);

CREATE TABLE sus_database.statusy
(
    status_id    INT AUTO_INCREMENT
        PRIMARY KEY,
    status_nazwa VARCHAR(255) NOT NULL
);
