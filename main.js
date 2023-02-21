const mysql = require('mysql');
const express = require('express');
const session = require('express-session');
const path = require('path');
const nodemailer = require('nodemailer');

const myAddress = 'mnbvcxzlkmjnhgfdsapoiuytrewq@gmail.com'; // tbd oficjalny email
const myPasword = 'zxpjpmjufaegyxpx';
let con;
let myMail = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  safe: true,
  port: 587,
  auth: {
    user: myAddress,
    pass: myPasword
  }
});

function haszuj(txt, p = 2137, M = 9223372036854775783) {
  let hash = 0;
  for(let i = 0; i < txt.length; i++) {
    hash *= p;
    //hash += txt[i].toInteger();
    hash += txt.charCodeAt(i);
    hash %= M;
    if(hash < 0) 
      hash += M;
  }
  return hash;
}

function create_user(username, password, admin) {
  let hash_password = haszuj(password);
  console.log(hash_password);
  let sql = "INSERT INTO users (Username, PasswordHash, czyAdmin) VALUES ('" + username.toString() + "', " + hash_password.toString() + ", " + admin.toString() + ");";
  con.query(sql, function(err) {
    if(err) throw err;
    console.log("gud boi");
  })
}

function connect_to_db(myHost, myUser, myPassword, myDatabase) {

  con = mysql.createConnection({
    host: myHost,
    user: myUser,
    password: myPassword,
    database: myDatabase
  });

  con.connect(function(err) {
    if (err) throw err;
    //console.log("Connected!");
  });
  return 0;
}


function main() {
  if(connect_to_db("localhost", "sqluser", "imposter", "test_db") !== 0) {
    console.log("Problem z bazą danych");
    return -1;
  }

  //let lol = check_user('admin', 'admin');
  //console.log("returned ", lol, global_shenadigans);


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
    response.redirect('/');
  })

  app.post('/auth', function(request, response) {
    let username = request.body.nick;
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

  app.get('/dodaj', function (request, response) {
    if(request.session.isadmin && request.session.loggedin)
      response.sendFile(__dirname + "/admin_panel/add_user.html");
    else
      response.sendFile(__dirname + "/login/oszust.html");
  });

  app.post('/dodaj_db', function (request, response){
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

  app.get('/new', function (request, response){
    response.sendFile(__dirname + '/login/add.html');
  });

  app.post('/new/auth', function (request, response) {
    let onetime_id = request.body.id;
    let nick = request.body.nick;
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

        sql = "UPDATE users SET Username = '" + nick + "', PasswordHash = " + haszuj(pwd) + " WHERE Username='" + onetime_id + "';";
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

  app.get('/zmien_haslo', function(request, response) {
    if(request.session.loggedin)
      response.sendFile(__dirname + '/login/zmien_haslo.html');
    else
      response.sendFile(__dirname + '/login/oszust.html');
  });

  app.post('/zmien_haslo/auth', function(request, response) {
    let nick = request.session.username;
    let old_pwd = request.body.stare;
    let new_pwd = request.body.nowe;
    let sql = "SELECT * FROM users WHERE Username = '" + nick + "' AND PasswordHash = " + haszuj(old_pwd).toString() + ";";
    con.query(sql, function(err, result) {
      if(err)
        throw err;
      if(result.length == 0) {
        response.send("stare hasło się nie zgadza");
        response.end();
        return;
      }
      let sql2 = "UPDATE users SET PasswordHash = " + haszuj(new_pwd) + " WHERE Username='" + nick + "';";
      con.query(sql2, function(err, result) {
        if(err)
          throw err;
        response.send("Hasło zmienione");
        response.end();
      })
    });
  })

  app.listen(3000, '0.0.0.0');
}


main();
//connect_to_db("localhost", "sqluser", "imposter", "test_db");
//create_user('admin', 'admin', 1);
//create_user('twoj_stary', '2137', 0);
