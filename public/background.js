// Background script for Chrome extension
let recordingTabId = null
let mediaStream = null

const chrome = window.chrome // Declare the chrome variable

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startTabCapture") {
    startTabCapture(request.tabId)
      .then((stream) => {
        recordingTabId = request.tabId
        sendResponse({ success: true, streamId: stream.id })
      })
      .catch((error) => {
        console.error("Tab capture failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // Keep message channel open for async response
  }

  if (request.action === "stopTabCapture") {
    stopTabCapture()
    sendResponse({ success: true })
  }
})

async function startTabCapture(tabId) {
  try {
    const stream = await chrome.tabCapture.capture({
      audio: true,
      video: false,
    })

    if (!stream) {
      throw new Error("Failed to capture tab audio")
    }

    mediaStream = stream
    return stream
  } catch (error) {
    throw new Error(`Tab capture error: ${error.message}`)
  }
}

function stopTabCapture() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop())
    mediaStream = null
  }
  recordingTabId = null
}

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recordingTabId) {
    stopTabCapture()
  }
})
