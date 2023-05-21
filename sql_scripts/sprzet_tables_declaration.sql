CREATE TABLE sus_database.sprzet
(
    przedmiot_id   int auto_increment
        primary key,
    nazwa          varchar(255)         not null,
    kategoria_id   int                  not null,
    ilosc          int                  not null,
    lokalizacja_id int                  not null,
    zdjecie_path   text                 null,
    wlasciciel_id  int                  null,
    uzytkownik_id  int                  null,
    status_id      int                  not null,
    stan_id        int                  not null,
    opis           varchar(1023)        null,
    og_id          int                  null,
    czy_usuniete   tinyint(1) default 0 null,
    constraint sprzet_kategorie_KategoriaID_fk
        foreign key (kategoria_id) references kategorie (kategoria_id),
    constraint sprzet_lokalizacje_LokalizacjaID_fk
        foreign key (lokalizacja_id) references lokalizacje (lokalizacja_id),
    constraint sprzet_podmioty_PodmiotID_fk
        foreign key (uzytkownik_id) references podmioty (podmiot_id),
    constraint sprzet_sprzet_przedmiot_id_fk
        foreign key (og_id) references sprzet (przedmiot_id),
    constraint sprzet_statusy_StatusID_fk
        foreign key (status_id) references statusy (status_id),
    constraint sprzet_wlasciciele_WlascicielID_fk
        foreign key (wlasciciel_id) references podmioty (podmiot_id)
);

CREATE TABLE sus_database.zdjecia_uszkodzen
(
    zdjecie_id   INT AUTO_INCREMENT
        PRIMARY KEY,
    zdjecie      MEDIUMBLOB NOT NULL,
    przedmiot_id INT        NOT NULL,
    CONSTRAINT zdjecia_uszkodzen_sprzet_PrzedmiotID_fk
        FOREIGN KEY (przedmiot_id) REFERENCES sus_database.sprzet (przedmiot_id)
);
