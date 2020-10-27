const web = 'https://oje.seucpc.club:84/'

const { WindowsToaster } = require('node-notifier');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { clipboard, remote } = require('electron');
const { Menu, MenuItem, dialog } = remote;
const win = remote.getCurrentWindow();

function needAssistTip() {
	const { getFocusAssist, isPriority } = require('windows-focus-assist');
	let name = getFocusAssist().name;
	if (name === 'PRIORITY_ONLY') {
		return isPriority('club.seucpc.printer').name === 'NO';
	} else if (name === 'ALARMS_ONLY') {
		return true;
	}
	return false;
}

function checkAssistTip() {
	if (needAssistTip()) $('#assisttip').show();
	else $('#assisttip').hide();
}

let notifier = new WindowsToaster({ withFallback: true });

function showNotify(title, message, id) {
	let option = {
		title,
		message,
		icon: path.join(__dirname, 'icon.png'),
		sound: true,
		appID: 'club.seucpc.printer',
		id
	};
	notifier.notify(option);
}

let curTop = localStorage['top'] !== 'false';
function setTop() {
	localStorage['top'] = curTop.toString()
	win.setAlwaysOnTop(curTop);
	if (curTop) $("#max").addClass('selected');
	else $("#max").removeClass('selected')
}
setTop();

function pageX(elem) {
	return elem.offsetParent ? (elem.offsetLeft + pageX(elem.offsetParent)) : elem.offsetLeft;
}
function pageY(elem) {
	return elem.offsetParent ? (elem.offsetTop + pageY(elem.offsetParent)) : elem.offsetTop;
}
function changeTitle(a, cb) {
	win.title = a;
	$("#Bar>h1#title").fadeOut(200, function () {
		$(this).html(a).fadeIn(200, cb);
	});
}
win.restore();
win.on("focus", function () { checkAssistTip(); wrap.style.backgroundColor = ""; });
win.on("blur", function () { wrap.style.backgroundColor = "rgba(0, 0, 0, 0.1)"; });
win.focus();
changeTitle("打印服务 - 东南大学程序设计类竞赛俱乐部", function () {
	$("#loadbox").fadeOut(250);
	$("#btnimg").fadeIn(250);
	$("#login").fadeIn(250);
	$("#Bar>#buttons").fadeIn(250, function () {
		this.style.pointerEvents = "auto";
		$("#buttons>#min").click(function () {
			win.minimize();
		});
		$('#buttons>#max').click(() => {
			curTop = !curTop;
			setTop();
		});
		$("#buttons>#close").click(function () {
			window.close();
		});
	});
});

function I(id) { return document.getElementById(id); }
function info(text, at) {
	at = at || "errpwd";
	let green = false;
	if (text == "logout" || text == "print started") {
		if (text == "logout") I(at).innerHTML = "<b>登出</b> 成功";
		else I(at).innerHTML = "<b>打印</b> 成功";
		I(at).style.color = '#65e05d';
		green = true;
	} else {
		I(at).style.color = null;
		if (text == "not verified") I(at).innerHTML = "<b>登录</b> 过期";
		else if (text == "prt failed") I(at).innerHTML = "<b>打印</b> 失败";
		else if (text == "not a pdf file") I(at).innerHTML = "所上传的不是 <b>PDF</b> 文件";
		else if (text == "Password not correct") I(at).innerHTML = "<b>密码</b> 错误";
		else if (text == "Username not found") I(at).innerHTML = "<b>用户名</b> 不存在";
		else I(at).innerHTML = text;
	}
	if (at == 'prtinfo') {
		boxCC.text = I(at).innerHTML;
		boxCC.color = green ? '#65e05d' : '#fd6075';
		boxCC.refresh();
		return;
	}
	I(at).style.opacity = "0";
	setTimeout(function () {
		I(at).style.display = "block";
		I(at).style.opacity = "1";
		setTimeout(function () {
			I(at).style.opacity = "0";
			setTimeout(function () {
				I(at).style.opacity = "1";
			}, 250);
		}, 250);
	}, 250);
}
let jwt = localStorage.jwt;
let cfg = null;
let loginIn = false;
let socket = null;
let heartbeatTimer = null;
let send_queue = [];
let socket_box_err = null;
let sides = 'one-sided';
let prtCnt = 1;

function socketSender(to, message) {
	try {
		if (socket === null) throw new Error('empty socket');
		socket.emit('send', to, message);
	} catch (err) {
		send_queue.push({ to, message });
	}
}

function socketTrigger(on) {
	if (on) {
		if (socket !== null) return;
		let beated = true;
		socket = io(web + 'chat');
		socket.on('notify', (data) => {
			showNotify('来自 ' + data.from + ' 的信息 - ' + ((new Date(data.public_time * 1000)).toLocaleString()),
				data.message, data.remark);
		});
		socket.on('logout', () => {
			doLogout();
		});
		socket.on('send_back', ii => {
			if (!ii.success) {
				socket_box_err = boxCC.state;
				info(ii.reason, 'prtinfo');
			} else if (socket_box_err) {
				boxCC.state = socket_box_err;
			}
		});
		socket.on('heartbeat', () => {
			beated = true;
		});
		socket.on('connect', () => {
			socket.emit('register', jwt);
		});
		while (send_queue.length > 0) {
			let rec = send_queue.shift();
			socketSender(rec.to, rec.message);
		}
		if (heartbeatTimer === null) {
			heartbeatTimer = setInterval(() => {
				if (!beated) {
					console.log('no heartbeat');
					socketTrigger(false);
					socketTrigger(true);
				}
				socket.emit('heartbeat', jwt);
				beated = false;
			}, 60 * 1000);
		}
	} else {
		if (socket === null) return;
		clearInterval(heartbeatTimer);
		heartbeatTimer = null;
		socket.close();
		socket = null;
	}
}

let curBox = 'login';
function switchPage(boxId, noMore = false) {
	let np = new Promise(re => {
		$('.handle#' + curBox).fadeOut(250, () => {
			$('.handle').hide();
			$('.handle#' + boxId).fadeIn(250, () => {
				re();
			});
		});
	});
	curBox = boxId;
	if (noMore) return;
	if (boxId == 'printer') {
		$.post(web + 'cfg', { jwt: jwt }, function (e) {
			if (!e.success) {
				np.then(_ => {
					doLogout();
				});
			}
			cfg = e.cfg;
			if (cfg.admin) {
				I('prtname').value = cfg.printer;
				I('prtname').style.borderColor = '#65e05d';
				$('#prtcc').show();
				$('#prtadmin').show();
			} else {
				$('#prtcc').hide();
				$('#prtadmin').hide();
			}
			if (cfg.chat.length === 1 && cfg.chat[0] === 'admin') {
				$('#prtsimple').show();
			} else {
				$('#prtsimple').hide();
			}
		}, 'json');
		loginIn = true;
		socketTrigger(true);
	}
}

function doCheck() {
	let xhr = new XMLHttpRequest();
	xhr.open("post", web + "verify");
	xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
	xhr.onreadystatechange = function () {
		if (xhr.readyState == 4 && xhr.status == 200) {
			let json = JSON.parse(xhr.responseText);
			if (json.success && json.data.isValid) {
				switchPage("printer");
			} else {
				jwt = null;
				delete localStorage.jwt;
			}
		}
	};
	xhr.send("jwt=" + encodeURIComponent(jwt));
}
if (jwt) doCheck();
function doSubmit() {
	if (I('username').value.length === 0) {
		info('<b>用户名</b> 未填写');
		return false;
	}
	if (I('pwd').value.length === 0) {
		info('<b>密码</b> 未填写');
		return false;
	}
	let xhr = new XMLHttpRequest();
	xhr.open("post", web + "login");
	xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
	xhr.timeout = 1500;
	xhr.onreadystatechange = function () {
		if (xhr.readyState == 4 && xhr.status == 200) {
			let json = JSON.parse(xhr.responseText);
			if (!json.success)
				info(json.message);
			else {
				jwt = json.data.jwt;
				localStorage.jwt = jwt;
				switchPage("printer");
			}
		}
	};
	xhr.ontimeout = function () {
		info('<b>网络</b> 异常');
	};
	xhr.send("name=" + encodeURIComponent(I('username').value) + "&pwd=" + encodeURIComponent(I('pwd').value));
	return false;
}

function doLogout() {
	I('username').value = I('pwd').value = '';
	delete localStorage.jwt;
	jwt = null;
	newFile(null);
	loginIn = false;
	socketTrigger(false);
	switchPage("login");
}
I('logout').onclick = function () {
	doLogout();
	info('logout');
	return false;
};
I('prtpaste').onclick = function () {
	let menu = new Menu();
	let langs = ['plain', 'c', 'cpp', 'java', 'py', 'javascript', 'csharp'];
	for (let lang of langs) {
		let cl = lang;
		menu.append(new MenuItem({
			label: cl,
			click() {
				let xhr = new XMLHttpRequest();
				xhr.open("post", web + "print_text");
				xhr.onreadystatechange = function () {
					if (xhr.readyState == 4 && xhr.status == 200) {
						let json = JSON.parse(xhr.responseText);
						if (!json.success) {
							if (json.message == "jwt malformed") json.message = 'not verified';
							if (json.message == "not verified") {
								doLogout();
								info(json.message);
							} else info(json.message, "prtinfo");
						}
						else {
							info(json.message, "prtinfo");
						}
					}
				};
				xhr.timeout = 1500;
				xhr.ontimeout = function () {
					info('<b>网络</b> 异常', "prtinfo");
				};
				xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
				xhr.send('jwt=' + encodeURIComponent(jwt) + '&buffer=' + encodeURIComponent(clipboard.readText()) + '&type=' + encodeURIComponent(cl) + "&cnt=" + encodeURIComponent(prtCnt) + "&sides=" + encodeURIComponent(sides));
			}
		}));
	}
	menu.popup({
		x: pageX(this),
		y: pageY(this) - 36
	});
	return false;
};

I('prttip').onclick = function () {
	let infos = {
		'申请放气球': null,
		'题册催促': '请加快发放该队伍的题册',
		'打印催促': '请加快发放该队伍已提交的打印的内容',
		'申请矿泉水': '请分发给该队伍一瓶矿泉水',
		'申请上厕所': '该队伍有人需要上厕所(请在无他人上厕所时准备好会议摄像头并同意申请)',
		'打印技术支持': '该队伍需要技术支持(志愿者中如有技术支持者请上前帮助)',
		'其他事宜': '请向该队伍询问具体需要的帮助'
	};
	if (cfg.problems) {
		let ball = {};
		for (let i = 0; i < cfg.problems; i++) {
			ball[String.fromCharCode(65 + i)] = '请给予给队伍 ' + String.fromCharCode(65 + i) + ' 题气球(颜色参考墙上)';
		}
		infos['申请放气球'] = ball;
	}
	function buildMenu(infos) {
		let menu = new Menu();
		for (let name in infos) {
			let val = infos[name];
			if (val === null) continue;
			let option = {
				label: name
			};
			if (typeof val === 'object') {
				option.submenu = buildMenu(val);
			} else {
				option.click = function () {
					socketSender('admin', val);
				};
			}
			menu.append(new MenuItem(option))
		}
		return menu
	}
	let menu = buildMenu(infos);
	menu.popup({
		x: pageX(this),
		y: pageY(this) - 36
	});
	return false;
};

I('sender_back').onclick = function () {
	I('sender_message').value = '';
	switchPage('printer', true);
	return false;
};

function senderSend() {
	if (!Array.isArray(cfg.chat)) return false;
	let menu = new Menu();
	for (let name of cfg.chat) {
		let nn = name;
		menu.append(new MenuItem({
			label: name,
			click() {
				socketSender(nn, I('sender_message').value);
				I('sender_back').onclick();
			}
		}));
	}
	menu.popup({
		x: pageX(I('sender_send')),
		y: pageY(I('sender_send')) - 36
	});
	return false;
}

I('prtadmin').onclick = function () {
	if (!Array.isArray(cfg.chat)) return;
	let tips = [
		'打印正在分发中',
		'上厕所请求已受理，请欲上厕所的选手听从指令',
		'所催促内容正在紧张制作中',
		'气球正在紧张制作中',
		'输入内容'
	];
	let menu = new Menu();
	for (let tip of tips) {
		let tt = tip;
		if (tt === '输入内容') {
			menu.append(new MenuItem({
				label: tt,
				click() {
					I('sender_message').value = '';
					switchPage('sender');
				}
			}));
			continue;
		}
		let sub = new Menu();
		for (let name of cfg.chat) {
			let nn = name;
			sub.append(new MenuItem({
				label: name,
				click() {
					socketSender(nn, tt);
				}
			}));
		}
		menu.append(new MenuItem({
			label: tt,
			submenu: sub
		}));
	}
	menu.popup({
		x: pageX(this),
		y: pageY(this) - 36
	});
	return false;
};

class BoxController {
	constructor(elem) {
		this.elem = elem;
		this.init();
	}
	init() {
		this._color = '#eee';
		this._px = '10';
		this._text = '拖入或者点击上传待打印文件'
		this._state = 0
		this.setValues();
	}
	setValues() {
		this.elem.style.borderColor = this._color;
		this.elem.style.color = this._color;
		this.elem.style.boxShadow = 'inset ' + this._color + ' 0 0 ' + this._px + 'px 0px';
		this.elem.innerHTML = this._text;
	}
	refresh() {
		this._state++;
	}
	get state() {
		return {
			mark: ++this._state,
			px: this._px,
			color: this._color,
			text: this._text
		}
	}
	set state(value) {
		if (value.mark == this._state) {
			this._color = value.color;
			this._px = value.px;
			this._text = value.text;
			this.setValues();
		}
	}
	get text() {
		return this._text;
	}
	set text(value) {
		this._text = value;
		this.setValues();
	}
	get color() {
		return this._color;
	}
	get px() {
		return this._px;
	}
	set color(value) {
		this._color = value;
		this.setValues();
	}
	set px(value) {
		this._px = value;
		this.setValues();
	}
};
class Cnter {
	constructor() {
		this.cnt = 0;
	}
	add() {
		if (this.cnt == 0) this.have();
		this.cnt++;
	}
	sub() {
		this.cnt--;
		if (this.cnt == 0) this.lose();
	}
};
let boxCC = new BoxController(I('uploadBox'));
class BoxCnter extends Cnter {
	have() {
		this.old = boxCC.state
		boxCC.color = '#eee';
		boxCC.px = 20;
		boxCC.text = '请将待打印文件拖入此框内'
	}
	lose() {
		boxCC.state = this.old
	}
};
let boxCnter = new BoxCnter();


let file = null;
function newFile(newFile) {
	if (newFile === null) {
		file = null;
		boxCC.init();
		return;
	}
	file = newFile;
	console.log('New file: ', file);
	boxCC.text = '当前文件：' + file.name;
	boxCC.px = 10
	boxCC.color = '#eee'
	boxCC.refresh()
}
I('uploadBox').onclick = function () {
	let old = boxCC.state
	boxCC.px = 20;
	boxCC.color = '#eee';
	boxCC.text = '请选择待打印文件'
	function reold() {
		window.removeEventListener('focus', reold)
		boxCC.state = old;
	}
	dialog.showOpenDialog(win, {
		title: '请选择待打印文件',
		properties: ['openFile'],
		filters: [
			{ name: '常见待打印文件', extensions: ['cc', 'c', 'cpp', 'java', 'py', 'js', 'markdown', 'h', 'hpp', 'bdy', 'inc', 'pas', 'pp', 'cs', 'html', 'htm', 'css', 'sh', 'cmd', 'bat', 'lua', 'sql', ' as', 'vb', 'vbs', 'cmd', 'pl', 'php', 'pdf', 'md', 'markdown', 'txt', 'log', 'in', 'out'] },
			{ name: 'PDF 文件', extensions: ['pdf'] },
			{ name: 'Markdown 文件', extensions: ['md', 'markdown'] },
			{ name: '代码文件', extensions: ['cc', 'c', 'cpp', 'java', 'py', 'js', 'markdown', 'h', 'hpp', 'bdy', 'inc', 'pas', 'pp', 'cs', 'html', 'htm', 'css', 'sh', 'cmd', 'bat', 'lua', 'sql', ' as', 'vb', 'vbs', 'cmd', 'pl', 'php'] },
			{ name: '文本文件', extensions: ['txt', 'log', 'in', 'out'] },
			{ name: '任意文件', extensions: ['*'] }
		]
	}).then(async res => {
		reold();
		if (!res.canceled && res.filePaths.length > 0) {
			let cur = res.filePaths[0];
			newFile(new File([await fsp.readFile(cur)], path.basename(cur)));
		}
	}, reold);
};

window.ondragenter = function (e) {
	boxCnter.add();
};
window.ondragleave = function (e) {
	boxCnter.sub();
};
window.ondrop = function (e) {
	boxCnter.sub();
	e.preventDefault();
};
window.ondragover = function (e) {
	e.preventDefault();
};
I('uploadBox').ondragover = function (e) {
	e.preventDefault();
};
I('uploadBox').ondrop = function (e) {
	if (e.dataTransfer.files.length > 0) {
		newFile(e.dataTransfer.files[0]);
		e.preventDefault();
	}
};

function doPrint() {
	if (file === null) {
		info('拖入或者点击上传待打印文件', "prtinfo");
		return false;
	}
	let xhr = new XMLHttpRequest();
	xhr.open("post", web + "print");
	xhr.onreadystatechange = function () {
		if (xhr.readyState == 4 && xhr.status == 200) {
			let json = JSON.parse(xhr.responseText);
			if (!json.success) {
				if (json.message == "jwt malformed") json.message = 'not verified';
				if (json.message == "not verified") {
					doLogout();
					info(json.message);
				} else info(json.message, "prtinfo");
			}
			else {
				info(json.message, "prtinfo");
			}
		}
	};
	xhr.timeout = 1500;
	xhr.ontimeout = function () {
		info('<b>网络</b> 异常', "prtinfo");
	};
	let data = new FormData();
	data.append("jwt", jwt);
	data.append("pdf", file);
	data.append("cnt", prtCnt);
	data.append("sides", sides);
	xhr.send(data);
	return false;
}

I('prtname').onchange = I('prtname').onkeypress = I('prtname').oninput = function() {
	if (I('prtname').value !== cfg.printer) I('prtname').style.borderColor = null;
	else I('prtname').style.borderColor = '#65e05d';
};

function setPrinterName() {
	let new_name = I('prtname').value;
	$.post(web + 'set_printer', { jwt: jwt, printer: I('prtname').value }, e => {
		I('prtname').style.borderColor = e.success ? '#65e05d' : '#fd6075';
		if (e.success) cfg.printer = new_name;
	}, 'json');
}

$("#prtsettings").click(() => {
	let menu = new Menu();
	menu.append(new MenuItem({
		label: '设置使用的打印机名',
		click() {
			setPrinterName();
		},
		type: 'checkbox',
		checked: I('prtname').value === cfg.printer
	}));
	let types = [['one-sided', '单面打印'], ['two-sided-short-edge', '短边翻转'], ['two-sided-long-edge', '长边翻转']];
	let sideMenu = new Menu();
	for(let item of types) {
		let type = item;
		sideMenu.append(new MenuItem({
			label: type[1],
			checked: sides === type[0],
			type: 'checkbox',
			click() {
				sides = type[0];
			}
		}));
	}
	menu.append(new MenuItem({
		label: '设置翻页方式',
		submenu: sideMenu,
		checked: I('prtname').value === cfg.printer
	}));
	let cntMod = [], cntSet = new Set();
	function addCntMod(cnt, name) {
		if (cntSet.has(cnt) || cnt < 1) return;
		cntSet.add(cnt);
		cntMod.push([cnt + ' (' + name + ')', cnt]);
	}
	addCntMod(1, '默认值');
	addCntMod(prtCnt, '当前值');
	let deltas = [12, 10, 9, 6, 3, 1, 2];
	for(let delta of deltas) {
		addCntMod(prtCnt + delta, '+' + delta);
		addCntMod(prtCnt - delta, '-' + delta);
	}
	cntMod.sort((a,b)=>{
		return a[1]-b[1];
	});
	let sideMenu2 = new Menu();
	for(let item of cntMod) {
		let cnt = item[1];
		sideMenu2.append(new MenuItem({
			label: item[0],
			checked: prtCnt == cnt,
			type: 'checkbox',
			click() {
				prtCnt = cnt;
			}
		}));
	}
	menu.append(new MenuItem({
		label: '设置页面数量',
		submenu: sideMenu2,
		checked: I('prtname').value === cfg.printer
	}));
	console.log(menu)
	menu.popup({
		x: pageX(I('prtsettings')),
		y: pageY(I('prtsettings')) - 36
	});
	return false
});