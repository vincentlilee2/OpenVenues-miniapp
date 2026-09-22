// 微信头像上传
// chooseAvatar 给的是本机临时文件路径（wxfile://tmp_xxx），只在本机短暂有效：
// 必须压缩 → 读 base64 → 上传到服务端落盘 → 拿回可长期访问的相对路径。
const api = require('../api/index.js');

function compressImage(src) {
  return new Promise((resolve) => {
    if (!wx.compressImage) return resolve(src);
    wx.compressImage({
      src,
      quality: 70,
      success: (r) => resolve(r.tempFilePath || src),
      fail: () => resolve(src), // 压缩失败就用原图
    });
  });
}

function readBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => resolve(r.data),
      fail: (e) => reject(new Error((e && e.errMsg) || '读取图片失败')),
    });
  });
}

function fileExt(p) {
  const m = String(p).split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  const ext = m ? m[1].toLowerCase() : 'jpg';
  return ['jpg', 'jpeg', 'png', 'webp'].indexOf(ext) >= 0 ? ext : 'jpg';
}

/** 是否是本机临时路径（需要上传） */
function isLocalTemp(p) {
  return !!p && (/^wxfile:/.test(p) || /^https?:\/\/tmp/.test(p) || /^http:\/\/usr/.test(p));
}

/**
 * 上传头像，返回服务端可访问的相对路径
 * @param {string} localPath chooseAvatar 给的临时路径
 */
async function uploadAvatar(localPath) {
  const compressed = await compressImage(localPath);
  const data = await readBase64(compressed);
  if (!data) throw new Error('读取图片内容为空');
  const res = await api.uploadAvatar({ data, ext: fileExt(compressed) });
  return res.avatar;
}

module.exports = { uploadAvatar, isLocalTemp };
