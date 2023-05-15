CREATE TABLE sus_database.users
(
    username         VARCHAR(255)         NOT NULL
        PRIMARY KEY,
    password_hash    VARCHAR(255)         NOT NULL,
    czy_admin        TINYINT(1) DEFAULT 0 NOT NULL,
    adres_email      VARCHAR(255)         NULL,
    data_wygasniecia DATE                 NULL
);
