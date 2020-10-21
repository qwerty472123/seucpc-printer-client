const { app, BrowserWindow, screen } = require('electron')
const packaged = process.mainModule.filename.indexOf('app.asar') !== -1

if (!packaged) app.setAppUserModelId('club.seucpc.printer')

function createWindow() {
    const workArea = screen.getPrimaryDisplay().workArea
    
    let option = {
        width: 530,
        height: 165,
        frame: false,
        resizable: false,
        icon: "build/icon.png",
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            devTools: !packaged
        }
    }
    option.x = workArea.width - option.width
    option.y = workArea.height - option.height

    const win = new BrowserWindow(option)

    win.loadFile('./index.html')

    if(!packaged)
        win.webContents.openDevTools()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})