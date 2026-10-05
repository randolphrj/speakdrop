// Keeps SpeakDrop to one running copy.
//
// Closing the main window only hides it to the tray, so launching the app
// again (e.g. from the Start menu) used to start a second copy. Two copies
// fight over the global hotkey and the microphone, which leaves dictations
// running in the background with no way to stop them.
//
// The first copy listens on a loopback port derived from the app identifier
// (so dev and release builds don't collide). A later copy that finds the port
// taken asks the first copy to show its window, then exits. If whatever holds
// the port doesn't answer like SpeakDrop, we start normally rather than
// refusing to launch.

use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::time::Duration;

const REPLY: &str = "ok";

pub enum Acquire {
    /// This is the only copy. Holds the listener when the port could be bound.
    Primary(Option<TcpListener>),
    /// Another copy is running and has been asked to show itself.
    AlreadyRunning,
}

/// Stable port in the dynamic range (49152–65535) for this identifier.
pub fn port_for(identifier: &str) -> u16 {
    // FNV-1a: deterministic across runs and Rust versions, unlike DefaultHasher.
    let mut hash: u32 = 0x811c_9dc5;
    for byte in identifier.bytes() {
        hash ^= byte as u32;
        hash = hash.wrapping_mul(0x0100_0193);
    }
    49152 + (hash % 16384) as u16
}

fn show_request(identifier: &str) -> String {
    format!("{identifier}:show")
}

fn ask_existing_to_show(port: u16, identifier: &str) -> bool {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    if writeln!(stream, "{}", show_request(identifier)).is_err() {
        return false;
    }
    let mut reply = String::new();
    BufReader::new(stream).read_line(&mut reply).is_ok() && reply.trim() == REPLY
}

pub fn acquire(identifier: &str) -> Acquire {
    let port = port_for(identifier);
    match TcpListener::bind((Ipv4Addr::LOCALHOST, port)) {
        Ok(listener) => Acquire::Primary(Some(listener)),
        Err(_) if ask_existing_to_show(port, identifier) => Acquire::AlreadyRunning,
        // Port held by something else: run without single-instance protection.
        Err(_) => Acquire::Primary(None),
    }
}

/// Answer show requests from later launches on a background thread.
pub fn listen(listener: TcpListener, identifier: &str, on_show: impl Fn() + Send + 'static) {
    let expected = show_request(identifier);
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let mut line = String::new();
            let Ok(mut writer) = stream.try_clone() else {
                continue;
            };
            if BufReader::new(stream).read_line(&mut line).is_ok() && line.trim() == expected {
                let _ = writeln!(writer, "{REPLY}");
                on_show();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{acquire, listen, port_for, Acquire};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    #[test]
    fn port_is_stable_in_range_and_differs_between_builds() {
        let release = port_for("io.github.randolphrj.speakdrop");
        let dev = port_for("io.github.randolphrj.speakdrop.dev");
        assert_eq!(release, port_for("io.github.randolphrj.speakdrop"));
        assert!(release >= 49152);
        assert!(dev >= 49152);
        assert_ne!(release, dev);
    }

    #[test]
    fn second_launch_signals_the_first_and_backs_off() {
        let identifier = format!("speakdrop.test.{}.{:?}", std::process::id(), Instant::now());
        let Acquire::Primary(Some(listener)) = acquire(&identifier) else {
            panic!("first launch should own the port");
        };
        let shows = Arc::new(AtomicUsize::new(0));
        let counter = shows.clone();
        listen(listener, &identifier, move || {
            counter.fetch_add(1, Ordering::SeqCst);
        });

        assert!(matches!(acquire(&identifier), Acquire::AlreadyRunning));
        let deadline = Instant::now() + Duration::from_secs(2);
        while shows.load(Ordering::SeqCst) == 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(shows.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_foreign_listener_does_not_block_launch() {
        // Something that isn't SpeakDrop holds our port and never answers.
        let identifier = format!("speakdrop.foreign.{}.{:?}", std::process::id(), Instant::now());
        let _squatter =
            std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port_for(&identifier)))
                .unwrap();
        assert!(matches!(acquire(&identifier), Acquire::Primary(None)));
    }
}
