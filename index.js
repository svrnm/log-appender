let appdynamics;
if(process.env.APPDYNAMICS_CONTROLLER_HOST_NAME) {
  appdynamics = require("appdynamics");
  appdynamics.profile();
}
const express = require('express');
const multer  = require('multer')
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const sanitize = require("sanitize-filename");
const morgan = require('morgan')

const port = process.env.PORT ? process.env.PORT : 3131
const dest = process.env.UPLOAD_FOLDER ? process.env.UPLOAD_FOLDER : '/tmp'

const app = express();
const upload = multer({ dest })

app.use(morgan('combined'))


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
