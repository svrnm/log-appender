let appdynamics
let collect = () => {}
if (process.env.APPDYNAMICS_CONTROLLER_HOST_NAME && process.env.APPDYNAMICS_CONTROLLER_PORT) {
  console.log('Running with appdynamics, connecting to', process.env.APPDYNAMICS_CONTROLLER_HOST_NAME, ':', process.env.APPDYNAMICS_CONTROLLER_PORT)
  appdynamics = require('appdynamics')
  appdynamics.profile({

  })
  collect = (req, key, value) => {
    const transaction = appdynamics.getTransaction(req)
    transaction.addSnapshotData(key, value)
    transaction.addAnalyticsData(key, value)
  }
}
const bcrypt = require('bcrypt')
const express = require('express')
const multer = require('multer')
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const sanitize = require('sanitize-filename')
const morgan = require('morgan')
const basicAuth = require('express-basic-auth')

const port = process.env.PORT ? process.env.PORT : 3131
const dest = process.env.UPLOAD_FOLDER ? process.env.UPLOAD_FOLDER : '/tmp'
const adminName = process.env.UPLOAD_USERNAME ? process.env.UPLOAD_USERNAME : 'admin'
const adminPassword = process.env.UPLOAD_PASSWORD ? process.env.UPLOAD_PASSWORD : false

const app = express()
const upload = multer({ dest })

app.use(morgan('combined'))

if (adminPassword !== false) {
  console.log('Authentication will be required!')
  const users = {}
  users[adminName] = adminPassword

  if (process.env.UPLOAD_PASSWORD_0 || process.env.UPLOAD_PASSWORD_1) {
    const start = process.env.UPLOAD_PASSWORD_0 ? 0 : 1
    for (let i = start; process.env[`UPLOAD_PASSWORD_${i}`]; i++) {
      const username = process.env[`UPLOAD_USERNAME_${i}`] ? process.env[`UPLOAD_USERNAME_${i}`] : `user${i}`
      const password = process.env[`UPLOAD_PASSWORD_${i}`]
      users[username] = password
      console.log(`User ${username} added.`)
    }
  }

  const authorizer = async (username, password, cb) => {
    for (var i in users) {
      if (basicAuth.safeCompare(username, i) & users[i].startsWith('$2b$') ? await bcrypt.compare(password, users[i]) : basicAuth.safeCompare(password, users[i])) {
        return cb(null, true)
      }
    }

    return cb(null, false)
  }

  app.use(basicAuth({
    authorizer,
    authorizeAsync: true,
    challenge: true,
    realm: 'Please Authenticate'
  }))
}

app.use((error, req, res, next) => {
  res.json({ message: error.message })
})

app.get('/', async (req, res) => {
  const dirContent = (await (await fsp.readdir(dest)).reduce(async (r, name) => {
    const result = await r
    const stat = await fsp.stat(path.join(dest, name))
    if (name.startsWith('.') || !stat.isFile() || stat.uid !== process.getuid()) {
      return result
    }
    result.push({ name, stat })
    return result
  }, []))

  const list = dirContent.reduce((result, file) => {
    return result + `<li>${file.name} (size: ${file.stat.size}) [<a href="/delete/${file.name}">delete</a>]</li>`
  }, '')

  const form = '<form method="post" action="/upload" enctype="multipart/form-data"><input name="log" type="file"><button>submit</button></form>'

  const serverName = req.header('serverName') ? req.header('serverName') : `http://localhost:${port}`

  const howto = `<p>Use <code>curl</code> on the command line to upload log files: <pre>curl -F @LOCALFILE1 -F @LOCALFILE2 -u USERNAME:PASSWORD ${serverName}/upload/</pre>Or to stream files:<pre>curl -T LOCALFILE -u USERNAME:PASSWORD -v ${serverName}/stream/REMOTEFILE</pre></p>`

  res.send(`<!doctype html><html lang=en><title>Files</title><body><ul>${list}</ul>${form}${howto}`)
})

async function deleteFile(req, res) {
  const name = sanitize(req.params.name)
  const fileName = path.join(dest, name)
  if (name !== req.params.name || !fileName.startsWith(dest)) {
    res.send(400, `${name} is not allowed`)
    return
  }
  console.log('Deleting: ' + fileName)
  collect(req, 'filename', name)
  try {
    await fsp.unlink(fileName)
    res.json([`${name} deleted`])
  } catch {
    res.json([`${name} not deleted`])
  }
}

app.all('/delete/:name', deleteFile)
app.delete('/:name', deleteFile)

app.put('/stream/:name', (req, res) => {
  const name = sanitize(req.params.name)
  if (name !== req.params.name) {
    res.redirect(`/stream/${name}`)
    return
  }
  console.log('Creating write stream: ' + path.join(dest, name))
  collect(req, 'filename', name)
  const stream = fs.createWriteStream(path.join(dest, name), { flags: 'a' })
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
  console.log(req.files)
  const result = await Promise.all(req.files.map(async (file) => {
    const data = await fsp.readFile(file.path)
    collect(req, 'filename', file.originalname)
    await fsp.appendFile(path.join(dest, file.originalname), data)
    await fsp.unlink(file.path)
    return `${file.originalname} uploaded`
  }))
  res.json(result)
})

app.listen(port, function () {
  console.log(`log-appender listening on port ${port}! You can now upload files to ${dest}`)
})
