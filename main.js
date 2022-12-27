const mysql = require('mysql');
const express = require('express');
const session = require('express-session');
const path = require('path');
let con;

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

function create_user(username, password) {
  let hash_password = haszuj(password);
  console.log(hash_password);
  let sql = "INSERT INTO users (username, pwd_hash) VALUES ('" + username.toString() + "', '" + hash_password.toString() + "')";
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
    saveUnitialized: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'static')));

  app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname + '/login/index.html'));
  });

  app.get('/wyloguj', function(req, res) {
    req.session.loggedin = false;
    req.session.isadmin = false;
    res.redirect('/');
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
          request.session.loggedin = true;
          request.session.username = username;
          if(result[0].czyAdmin) {
            request.session.isadmin = true;
            response.redirect('/admin');
          }
          else {
            request.session.isadmin = false;
            response.redirect('/user');
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

  app.get('/admin', function(request, response) {
    if(request.session.loggedin && request.session.isadmin) {
      response.sendFile(path.join(__dirname + '/admin_panel/index.html'));
    }
    else {
      response.sendFile(path.join(__dirname + '/login/oszust.html'));
    }
  });

  app.get('/user', function(request, response) {
    if(request.session.loggedin) {
      response.sendFile(path.join(__dirname + '/admin_panel/index.html'));
    }
    else {
      response.sendFile(path.join(__dirname + '/login/oszust.html'));
    }
  });

  app.listen(3000, '0.0.0.0');
}

main();
//connect_to_db();
//create_user('admin', 'admin');
//create_user('twoj_stary', '2137');