use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{mpsc, oneshot};

pub struct WriteRequest {
    pub task: Box<dyn FnOnce() -> Result<serde_json::Value, String> + Send>,
    pub respondent: oneshot::Sender<Result<serde_json::Value, String>>,
}

#[derive(Clone)]
pub struct VaultWriterQueue {
    sender: mpsc::UnboundedSender<WriteRequest>,
    queue_depth: Arc<AtomicUsize>,
    last_write_ms: Arc<AtomicU64>,
}

impl VaultWriterQueue {
    pub fn new() -> Self {
        let (sender, mut receiver) = mpsc::unbounded_channel::<WriteRequest>();
        let queue_depth = Arc::new(AtomicUsize::new(0));
        let last_write_ms = Arc::new(AtomicU64::new(0));

        let qd = queue_depth.clone();
        let lw = last_write_ms.clone();

        tokio::spawn(async move {
            while let Some(req) = receiver.recv().await {
                // Decrement depth as we take it for execution
                qd.fetch_sub(1, Ordering::SeqCst);

                // Run task synchronously in blocking thread pool or directly if lightweight
                let result = tokio::task::spawn_blocking(move || (req.task)()).await;
                let final_res = match result {
                    Ok(r) => r,
                    Err(e) => Err(format!("Task execution panicked: {}", e)),
                };

                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                lw.store(now_ms, Ordering::SeqCst);

                let _ = req.respondent.send(final_res);
            }
        });

        Self {
            sender,
            queue_depth,
            last_write_ms,
        }
    }

    pub fn queue_depth(&self) -> usize {
        self.queue_depth.load(Ordering::SeqCst)
    }

    pub fn last_write_ms(&self) -> u64 {
        self.last_write_ms.load(Ordering::SeqCst)
    }

    pub async fn execute_write<F>(&self, task: F) -> Result<serde_json::Value, String>
    where
        F: FnOnce() -> Result<serde_json::Value, String> + Send + 'static,
    {
        let (tx, rx) = oneshot::channel();
        self.queue_depth.fetch_add(1, Ordering::SeqCst);

        let req = WriteRequest {
            task: Box::new(task),
            respondent: tx,
        };

        self.sender
            .send(req)
            .map_err(|_| "Failed to enqueue write request: queue closed".to_string())?;

        rx.await
            .map_err(|_| "Failed to receive write response: sender dropped".to_string())?
    }
}

impl Default for VaultWriterQueue {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_writer_queue_fifo_order() {
        let queue = VaultWriterQueue::new();
        let counter = Arc::new(std::sync::atomic::AtomicUsize::new(0));

        let mut handles = Vec::new();
        for i in 0..10 {
            let q = queue.clone();
            let c = counter.clone();
            handles.push(tokio::spawn(async move {
                q.execute_write(move || {
                    let current = c.fetch_add(1, Ordering::SeqCst);
                    Ok(serde_json::json!({ "idx": i, "order": current }))
                })
                .await
            }));
        }

        for h in handles {
            let res = h.await.unwrap().unwrap();
            assert!(res.get("idx").is_some());
        }

        assert!(queue.last_write_ms() > 0);
        assert_eq!(queue.queue_depth(), 0);
    }
}
