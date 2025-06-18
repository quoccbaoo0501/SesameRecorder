document.addEventListener("DOMContentLoaded", () => {
  const openRecorderBtn = document.getElementById("openRecorder")
  const quickRecordBtn = document.getElementById("quickRecord")
  const statusDiv = document.getElementById("status")

  // Declare chrome variable
  const chrome = window.chrome

  // Open full recorder in new tab
  openRecorderBtn.addEventListener("click", () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("recorder.html"),
    })
  })

  // Quick record current tab
  quickRecordBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.runtime.sendMessage(
        {
          action: "startTabCapture",
          tabId: tabs[0].id,
        },
        (response) => {
          if (response.success) {
            statusDiv.textContent = "Recording..."
            statusDiv.className = "status recording"
            quickRecordBtn.textContent = "Stop Recording"
          } else {
            alert("Failed to start recording: " + response.error)
          }
        },
      )
    })
  })

  // Check recording status
  chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
    if (response && response.isRecording) {
      statusDiv.textContent = "Recording..."
      statusDiv.className = "status recording"
      quickRecordBtn.textContent = "Stop Recording"
    }
  })
})
