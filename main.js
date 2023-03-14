const mysql = require('mysql2');
const mysql_promise = require('mysql2/promise');
const express = require('express');
const session = require('express-session');
const path = require('path');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');

const crypto = require('crypto');

const myAddress = 'mnbvcxzlkmjnhgfdsapoiuytrewq@gmail.com'; // tbd oficjalny email
const myPasword = 'zxpjpmjufaegyxpx';
let con, await_con;
let myMail = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  safe: true,
  port: 587,
  auth: {
    user: myAddress,
    pass: myPasword
  }
});

let kategorie, wlasciciele, lokalizacje, statusy;

function haszuj(txt) {
  /*
  let hash = 0;
  for(let i = 0; i < txt.length; i++) {
    hash *= p;
    //hash += txt[i].toInteger();
    hash += txt.charCodeAt(i);
    hash %= M;
    if(hash < 0) 
      hash += M;
  }
  */
  return crypto.createHash('sha256').update(txt).digest('hex');
}

function create_user(username, password, admin) {
  let hash_password = haszuj(password);
  console.log(hash_password);
  let sql = "INSERT INTO users (Username, PasswordHash, czyAdmin) VALUES ('" + username.toString() + "', '" + hash_password.toString() + "', " + admin.toString() + ");";
  con.query(sql, function(err) {
    if(err) throw err;
    console.log("gud boi");
  })
}

async function connect_to_db(myHost, myUser, myPassword, myDatabase) {

  con = mysql.createConnection({
    host: myHost,
    user: myUser,
    password: myPassword,
    database: myDatabase
  });
  await_con = await mysql_promise.createConnection({
    host: 'localhost',
    user: 'sqluser',
    password: 'imposter',
    database: 'test_db'
  });

  con.connect(function(err) {
    if (err) throw err;
    //console.log("Connected!");
  });
  return 0;
}


function build_table_users(ob) {
  let table = '<table><tr>';
  for(let i in ob[0]) {
    table += '<th>' + i.toString() + '</th>';
  }
  table += '<th> guziczki </th>';
  table += '</tr>';
  for(let i in ob) {
    table += '<tr>';
    for(let j in ob[i]) {
      table += '<td>';
      table += ob[i][j];
      table += '</td>';
    }
    table += '<td> ' +
        '<form action="/panel/uzytkownicy/usun" method="post"> ' +
        '<input type="submit" value="usuń"> ' +
        '<input type="hidden" name="Username" value="' + ob[i].Username + '"> ' +
        '</form> </td>';
    table += '</tr>';
  }
  table += '</table>';
  return table;
}


function build_table_body_sprzet(ob) {
  let table = '<tbody>';
  for(let i in ob) {
    table += '<tr>';
    for(let j in ob[i]) {
      if(j === 'PrzedmiotID' || j.contains('_'))
        continue;
      table += '<td>';
      if (j === 'KategoriaID')
        table += kategorie[ob[i][j]];
      else if (j === 'WlascicielID')
        table += wlasciciele[ob[i][j]];
      else if (j === 'LokalizacjaID')
        table += lokalizacje[ob[i][j]];
      else if (j === 'StatusID')
        table += statusy[ob[i][j]];
      else
        table += ob[i][j];
      table += '</td>';
    }
    /*table += '<td> ' +
        '<form action="/panel/uzytkownicy/usun" method="post"> ' +
        '<input type="submit" value="usuń"> ' +
        '<input type="hidden" name="Username" value="' + ob[i].Username + '"> ' +
        '</form> </td>';*/
    table += '</tr>';
  }
  table += '</tbody>';
  return table;
}

async function getTable(tableName, columnName) {  // works when a table has two columns: one ending with ID and hte ohter with Nazwa
  let table = [];
  let sql = 'SELECT * FROM ' + tableName + ';';
  let [rows, columns] = await await_con.execute(sql);

  for (let i in rows) {
    table[rows[i][columnName + 'ID']] = rows[i][columnName + 'Nazwa'];
  }

  //console.log(table);
  return table;
}

async function updateTables() {
  statusy = await getTable("statusy", "Status");
  lokalizacje = await getTable("lokalizacje", "Lokalizacja");
  wlasciciele = await getTable("wlasciciele", "Wlasciciel");
  kategorie = await getTable("kategorie", "Kategoria");
}

async function main() {
  if(await connect_to_db("localhost", "sqluser", "imposter", "test_db") !== 0) {
    console.log("Problem z bazą danych");
    return -1;
  }

  await updateTables();

  const app = express();
  app.use(session({
    secret: 'joe mama',
    resave: true,
    saveUninitialized: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'static')));

  app.get('/', function(request, response) {
    response.sendFile(path.join(__dirname + '/login/index.html'));
  });

  app.get('/wyloguj', function(request, response) {
    request.session.loggedin = false;
    request.session.isadmin = false;
    request.session.username = null;
    response.redirect('/');
  })

  app.post('/auth', function(request, response) {
    let username = request.body.nick;
    if(username.includes("'") || username.includes('"')) {
      response.sendFile(__dirname + '/login/for_injectors.html');
      return;
    }
    let password = request.body.pwd;
    if(username && password) {
      let sql = "SELECT * FROM users WHERE Username = '?' AND PasswordHash = '?';";
      let a = [username, haszuj(password)];
      let i = 0;

      while(sql.indexOf("?") >= 0) {
        sql = sql.replace("?", a[i++]);
      }

      //console.log(sql);
      con.query(sql, function(err, result) {
        if(err) throw err;
        let gut = result.length !== 0;
        if(gut) {
          if(result[0].DataWygasniecia != null) {
            let expiration_date = new Date(result[0].DataWygasniecia);
            let current_date = new Date();
            if (current_date > expiration_date) {
              response.sendFile(__dirname + '/login/wygaslo.html');
              return;
            }
          }

          request.session.loggedin = true;
          request.session.username = username;

          if(result[0].czyAdmin) {
            request.session.isadmin = true;
            response.redirect('/panel');
          }
          else {
            request.session.isadmin = false;
            response.redirect('/panel');
          }
          response.end();
        }
        else {
          response.sendFile(path.join(__dirname + '/login/zle_dane.html'));
        }
      });
    }
    else {
      response.sendFile(path.join(__dirname + '/login/zle_dane.html'));
    }
  });

  app.get('/panel', function(request, response) {
    if(request.session.loggedin) {
      if(request.session.isadmin)
        response.sendFile(__dirname + '/admin_panel/index.html');
      else
        response.sendFile(__dirname + '/user_panel/index.html');
    }
    else
      response.sendFile(__dirname + '/login/oszust.html');
  })

  app.get('/panel/dodaj_uzytkownika', function (request, response) {
    if(request.session.isadmin && request.session.loggedin)
      response.sendFile(__dirname + "/admin_panel/dodaj_uzytkownika.html");
    else
      response.sendFile(__dirname + "/login/oszust.html");
  });

  app.post('/panel/dodaj_uzytkownika/auth', function (request, response){
    if(!request.session.loggedin || !request.session.isadmin) {
      response.sendFile(__dirname + '/login/oszust.html');
      return 1;
    }
    let name = '';
    for(let i = 0; i < 10; i++) {
      let x = Math.floor(Math.random() * 62);
      // 0 <= x <= 9  =>  dodajemy liczbę x
      // 10 <= x <= 35  =>  dodajemy małą literę o nr x - 10
      // 36 <= x <= 61  =>  dodajemy wielką literę o nr x - 36
      if(x <= 9)
        name += x.toString();
      else if(x <= 35)
        name += String.fromCharCode(x - 10 + 'a'.charCodeAt(0));
      else
        name += String.fromCharCode(x - 36 + 'A'.charCodeAt(0));
    }
    let mailOptions = {
      from: myAddress,
      to: request.body.email,
      subject: "Założenie konta w Systemie Udokumentowywania Sprzętu",
      text: "Witaj!\nOto kod do założenia konta w SUS: " + name
    };
    myMail.sendMail(mailOptions, function(error, info) {
      if (error) {
        response.send("Coś poszło nie tak");
        console.log(error);
      }
      else {
        let toSend = "Wysłano e-mail na podany adres\n";

        let czyAdmin = '0';
        if(request.body.czyAdmin == 'on')
          czyAdmin = '1';
        let sql = "INSERT INTO users (Username, PasswordHash, czyAdmin) VALUES ('" + name + "', -1, " + czyAdmin + ");";
        //console.log(request.body.expires);
        //console.log(request.body.expires == 'on');
        if(request.body.expires == 'on') {
          let date = request.body.date;
          //console.log(date);
          sql = "INSERT INTO users (Username, PasswordHash, czyAdmin, DataWygasniecia) VALUES " + "('" + name + "', -1, " + czyAdmin + ", '" + date + "');";
        }
        con.query(sql, function(error) {
          if(error) {
            console.log(error);
            response.send(toSend + "Nie udało się dodać użytkownika");
          }
          else
            response.send(toSend);
        })
      }
    });
  });

  app.get('/aktywuj_konto', function (request, response){
    response.sendFile(__dirname + '/login/aktywuj_konto.html');
  });

  app.post('/aktywuj/auth', function (request, response) {
    let onetime_id = request.body.id;
    if(onetime_id.includes("'") || onetime_id.includes('"')) {
      response.sendFile(__dirname + '/login/for_injectors.html');
      return;
    }
    let nick = request.body.nick;
    if(nick.includes("'") || nick.includes('"')) {
      response.sendFile(__dirname + '/login/for_injectors.html');
      return;
    }
    let pwd = request.body.pwd1;
    let sql = "SELECT * FROM users WHERE Username='" + nick + "';";
    con.query(sql, function(error, result) {
      if(error) {
        console.log(error);
        response.send("Coś poszło nie tak");
        return 0;
      }
      if(result.length > 0) {
        response.send("Taki użytkownik już istnieje");
        return 0;
      }

      sql = "SELECT * FROM users WHERE Username='" + onetime_id + "' AND PasswordHash=-1;";
      con.query(sql, function(error, result) {
        if(error) {
          console.log(error);
          response.send("Coś poszło nie tak");
          return 0;
        }
        if(result.length == 0) {
          response.send("Niepoprawny identyfikator");
          return 0;
        }

        sql = "UPDATE users SET Username = '" + nick + "', PasswordHash = '" + haszuj(pwd) + "' WHERE Username='" + onetime_id + "';";
        con.query(sql, function(error) {
          if (error) {
            console.log(error);
            response.send("Coś poszło nie tak");
            return 0;
          }
          response.send("Udało się!");
        });
      });
    });
  });

  app.get('/panel/zmien_haslo', function(request, response) {
    if(request.session.loggedin)
      response.sendFile(__dirname + '/login/zmien_haslo.html');
    else
      response.sendFile(__dirname + '/login/oszust.html');
  });

  app.post('/panel/zmien_haslo/auth', function(request, response) {
    if(!(request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let nick = request.session.username;
    if(nick.includes("'") || nick.includes('"')) {
      response.sendFile(__dirname + '/login/for_injectors.html');
      return;
    }
    let old_pwd = request.body.stare;
    let new_pwd = request.body.nowe;
    let sql = "SELECT * FROM users WHERE Username = '" + nick + "' AND PasswordHash = '" + haszuj(old_pwd).toString() + "';";
    con.query(sql, function(err, result) {
      if(err)
        throw err;
      if(result.length == 0) {
        response.send("stare hasło się nie zgadza");
        response.end();
        return;
      }
      let sql2 = "UPDATE users SET PasswordHash = '" + haszuj(new_pwd).toString() + "' WHERE Username='" + nick + "';";
      con.query(sql2, function(err, result) {
        if(err)
          throw err;
        response.send("Hasło zmienione");
        response.end();
      })
    });
  })

  app.get('/panel/uzytkownicy', function(request, response) {
    if(!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let sql = 'SELECT * FROM users';
    con.query(sql, function(err, result) {
      if(err)
        throw err;
      const templateStr = fs.readFileSync(__dirname + '/admin_panel/uzytkownicy.html').toString('utf8');
      //console.log(templateStr);
      const template = handlebars.compile(templateStr, {noEscape: true});
      const contents = template({tablebody: build_table_users(result)});
      //console.log(contents);
      //response.send(build_table(result));
      response.send(contents);
      response.end();
    });
  });

  app.post('/panel/uzytkownicy/usun', function(request, response) {
    if(!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let nick = request.body.Username;
    if(nick.includes("'") || nick.includes('"')) {
      response.sendFile(__dirname + '/login/for_injectors.html');
      return;
    }
    if(nick == request.session.username) {
      response.send("lol nie możesz usunąć własnego konta");
      return;
    }
    let sql = "DELETE FROM users WHERE Username = '" + nick.toString() + "';";
    con.query(sql, function(err, result) {
      if(err)
        throw err;
      response.redirect('/panel/uzytkownicy');
    });
  });

  app.get('/panel/query', function (request, response) {
    if(!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    response.sendFile(__dirname + '/admin_panel/sql_query.html');
  });

  app.post('/panel/query/perform', function(request, response) {
    if(!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let sql = request.body.query;
    if(sql.toLowerCase().includes('drop') || sql.toLowerCase().includes('delete')) {
      response.send('nie ma usuwania');
      response.end();
      return;
    }
    con.query(sql, function(err, result) {
      if(err) {
        response.send('chyba coś nie tak z twoim syntaxem');
        response.end();
        return;
      }
      //response.send('Odpowiedź serwera: \n');
      response.send(result);
      response.end();
    });
  });

  app.get('/baza', function(request, response) {
    if(!request.session.loggedin) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let sql = 'SELECT * FROM sprzet';
    con.query(sql, function(err, result) {
      if(err)
        throw err;
      const templateStr = fs.readFileSync(__dirname + '/user_panel/baza.html').toString('utf8');
      const template = handlebars.compile(templateStr, {noEscape: true});
      const contents = template({tablebody: build_table_body_sprzet(result)});
      response.send(contents);
      response.end();
    });
  });

  app.get('/baza/update', async function(request, response) {
    await updateTables();
    response.redirect('/baza');
  })

  app.listen(3000, '0.0.0.0');
}


async function kms() {
  let statusy = await getTable('statusy', 'Status');
  console.log(statusy);
}

main();
//connect_to_db("localhost", "sqluser", "imposter", "test_db");
//create_user('admin', 'admin', 1);
//create_user('twoj_stary', '2137', 0);
//console.log(build_table([{"Username":"admin","PasswordHash":2023948189175633,"czyAdmin":1,"DataWygasniecia":null},{"Username":"twoj_stary","PasswordHash":488183148373,"czyAdmin":0,"DataWygasniecia":null}]));

//kms();