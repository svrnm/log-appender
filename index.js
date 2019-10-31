let appdynamics;
if(process.env.APPDYNAMICS_CONTROLLER_HOST_NAME && process.env.APPDYNAMICS_CONTROLLER_PORT) {
  console.log('Running with appdynamics, connecting to', process.env.APPDYNAMICS_CONTROLLER_HOST_NAME, ':', process.env.APPDYNAMICS_CONTROLLER_PORT)
  appdynamics = require("appdynamics");
  appdynamics.profile({

  });
}
const bcrypt = require('bcrypt');
const express = require('express');
const multer  = require('multer')
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const sanitize = require("sanitize-filename");
const morgan = require('morgan')
const basicAuth = require('express-basic-auth')

const port = process.env.PORT ? process.env.PORT : 3131
const dest = process.env.UPLOAD_FOLDER ? process.env.UPLOAD_FOLDER : '/tmp'
const adminName = process.env.UPLOAD_USERNAME ? process.env.UPLOAD_USERNAME : 'admin'
const adminPassword = process.env.UPLOAD_PASSWORD ? process.env.UPLOAD_PASSWORD : false

const app = express();
const upload = multer({ dest })

app.use(morgan('combined'))

if(adminPassword !== false) {
  console.log('Authentication will be required!')
  const users = {}
  users[adminName] = adminPassword

  if(process.env.UPLOAD_PASSWORD_0 || process.env.UPLOAD_PASSWORD_1) {
    const start = process.env.UPLOAD_PASSWORD_0 ? 0 : 1
    for(let i = start; process.env[`UPLOAD_PASSWORD_${i}`]; i++) {
      const username = process.env[`UPLOAD_USERNAME_${i}`] ? process.env[`UPLOAD_USERNAME_${i}`] : `user${i}`
      const password = process.env[`UPLOAD_PASSWORD_${i}`]
      users[username] = password
      console.log(`User ${username} added.`)
    }
  }

  const authorizer = async (username, password, cb) => {
    for(var i in users) {
      if(basicAuth.safeCompare(username, i) & users[i].startsWith('$2b$') ? await bcrypt.compare(password, users[i]) : basicAuth.safeCompare(password, users[i])) {
        return cb(null, true)
      }
    }

    return cb(null, false)
  }

  app.use(basicAuth({
    authorizer,
    authorizeAsync: true
  }))
}

app.get('/', function (req, res) {
  res.send('Hello World!');
});

app.put('/stream/:name', (req, res) => {
  name = sanitize(req.params.name)
  if(name !== req.params.name) {
    res.redirect(`/stream/${name}`)
    return
  }
  console.log('Creating write stream: ' + path.join(dest, name))
  var stream = fs.createWriteStream(path.join(dest, name), {flags: 'a'});
  // res.write(`${name} uploaded`)
  req.on('data', chunck => {
    stream.write(chunck)
  })
  req.on('end', (chunck) => {
    res.end(`${name} uploaded`)
  })
  res.on('finish', () => {
    console.log('Closing write stream: ' + path.join(dest, name))
    stream.close()
  })
})

app.post('/upload', upload.any(), async (req, res) => {
  const result = await Promise.all(req.files.map(async (file) => {
    const data = await fsp.readFile(file.path)
    await fsp.appendFile(path.join(dest, file.originalname), data)
    await fsp.unlink(file.path)
    return `${file.originalname} uploaded`
  }))
  res.json(result)
});

app.listen(port, function () {
  console.log(`log-appender listening on port ${port}! You can now upload files to ${dest}`);
});
