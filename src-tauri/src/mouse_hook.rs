//! 全局鼠标钩子(rdev):缓存光标坐标、把左键按下/抬起送入处理线程做划词门控。
//! 钩子回调必须极轻——只写原子 / 发 channel,绝不在回调里碰窗口或 get-selected-text。

use std::sync::atomic::{AtomicI32, Ordering};

/// 坐标缓存哨兵:`last_position` 在首个 MouseMove 之前返回 None。
const UNSET: i32 = i32::MIN;

static LAST_X: AtomicI32 = AtomicI32::new(UNSET);
static LAST_Y: AtomicI32 = AtomicI32::new(UNSET);

/// 由缓存的 (x,y) 还原光标位置;任一轴为哨兵视作未知。纯函数,便于单测。
fn decode_position(x: i32, y: i32) -> Option<(i32, i32)> {
    if x == UNSET || y == UNSET {
        None
    } else {
        Some((x, y))
    }
}

/// 最近一次缓存的光标物理坐标;首个 MouseMove 之前为 None。
pub fn last_position() -> Option<(i32, i32)> {
    decode_position(LAST_X.load(Ordering::Relaxed), LAST_Y.load(Ordering::Relaxed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_unset_axis_is_none() {
        assert_eq!(decode_position(UNSET, 10), None);
        assert_eq!(decode_position(10, UNSET), None);
        assert_eq!(decode_position(UNSET, UNSET), None);
    }

    #[test]
    fn decode_real_coords_is_some() {
        assert_eq!(decode_position(0, 0), Some((0, 0)));
        assert_eq!(decode_position(-5, 1280), Some((-5, 1280)));
    }
}
