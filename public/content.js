// Content script to detect AI responses
;(() => {
  let isMonitoring = false
  let lastAIResponse = ""
  const chrome = window.chrome // Declare the chrome variable

  // Listen for messages from the recorder
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startMonitoring") {
      startMonitoring()
      sendResponse({ success: true })
    } else if (request.action === "stopMonitoring") {
      stopMonitoring()
      sendResponse({ success: true })
    }
  })

  function startMonitoring() {
    if (isMonitoring) return
    isMonitoring = true

    // Monitor for new text content that might be AI responses
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) {
              checkForAIResponse(node)
            }
          })
        }
      })
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    // Store observer for cleanup
    window.sesameObserver = observer
  }

  function stopMonitoring() {
    isMonitoring = false
    if (window.sesameObserver) {
      window.sesameObserver.disconnect()
      window.sesameObserver = null
    }
  }

  function checkForAIResponse(node) {
    // Look for patterns that indicate AI responses
    const text = node.textContent || node.innerText || ""

    // Common AI response patterns
    const aiPatterns = [
      /^(I|Here|Let me|Based on|According to|The answer is)/i,
      /\b(AI|assistant|help|explain|understand)\b/i,
    ]

    if (text.length > 20 && aiPatterns.some((pattern) => pattern.test(text))) {
      if (text !== lastAIResponse) {
        lastAIResponse = text

        // Send AI response to recorder
        chrome.runtime.sendMessage({
          action: "aiResponse",
          text: text,
          timestamp: Date.now(),
          url: window.location.href,
        })
      }
    }
  }
})()
