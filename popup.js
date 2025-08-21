document.addEventListener("DOMContentLoaded", () => {
  const mdFileInput = document.getElementById("mdFile");
  const nameInput = document.getElementById("nameInput");
  const getGoalsBtn = document.getElementById("getGoalsBtn");
  const resultsDiv = document.getElementById("results");
  const fileStatus = document.getElementById("fileStatus");
  const exportBtn = document.getElementById("exportBtn");

  let markdownContent = "";
  let parsedGoalsData = [];
  getGoalsBtn.disabled = true;
  exportBtn.disabled = true;

  chrome.storage.local.get(["markdownContent", "lastQueriedName"], (data) => {
    if (data.markdownContent) {
      markdownContent = data.markdownContent;
      fileStatus.classList.remove("hidden");
      getGoalsBtn.disabled = false;
    }
    if (data.lastQueriedName) {
      nameInput.value = data.lastQueriedName;
    }
  });

  mdFileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      markdownContent = e.target.result;
      chrome.storage.local.set({ markdownContent: markdownContent }, () => {
        console.log("Markdown file saved.");
        fileStatus.classList.remove("hidden");
        getGoalsBtn.disabled = false;
      });
    };
    reader.readAsText(file);
  });

  getGoalsBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!markdownContent) {
      displayError("Please upload a Markdown file first.");
      return;
    }
    if (!name) {
      displayError("Please enter a name.");
      return;
    }

    chrome.storage.local.set({ lastQueriedName: name });

    try {
      parsedGoalsData = parseGoals(markdownContent, name);
      displayGoals(parsedGoalsData, name);
      exportBtn.disabled = parsedGoalsData.length === 0;
    } catch (error) {
      displayError(
        "An error occurred while parsing the file. Please check the file format."
      );
      console.error(error);
    }
  });

  exportBtn.addEventListener("click", () => {
    if (parsedGoalsData.length > 0) {
      exportToCsv(parsedGoalsData, nameInput.value.trim());
    } else {
      displayError("No goals to export. Please generate goals first.");
    }
  });

  function parseGoals(md, name) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const monthStr = currentMonth.toString().padStart(2, "0");
    const dateRegex = new RegExp(
      `###\\s+${currentYear}\\/${monthStr}\\/(\\d{2})`,
      "g"
    );
    const sections = md.split(dateRegex);

    const contentByDay = {};
    for (let i = 1; i < sections.length; i += 2) {
      const day = sections[i];
      const content = sections[i + 1];
      contentByDay[day] = content;
    }

    const memberGoals = [];
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${currentYear}/${monthStr}/${day
        .toString()
        .padStart(2, "0")}`;
      const dateObj = new Date(currentYear, currentMonth - 1, day);
      const dayOfWeek = dateObj.getDay();

      let goalsForDay = [];

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        goalsForDay.push("X");
      } else {
        const dayStr = day.toString().padStart(2, "0");
        const content = contentByDay[dayStr];

        if (content) {
          const nameRegex = new RegExp(
            `(####?\\s*${name}:|${name}:)([\\s\\S]*?)(?=(###\\s*\\d{4}|####?\\s*\\w+:|###\\s*💡))`,
            "i"
          );
          const memberMatch = content.match(nameRegex);

          if (memberMatch) {
            const memberBlock = memberMatch[2];
            const goalsRegex =
              /What could you say you have accomplished today\?([\s\S]*?)(\n-|\n\n|How close are we)/i;
            const goalsMatch = memberBlock.match(goalsRegex);

            if (goalsMatch) {
              const goalsText = goalsMatch[1].trim();
              const goalsList = goalsText
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.startsWith("- "));
              if (goalsList.length > 0) {
                goalsForDay = goalsList.map((item) => item.substring(2));
              }
            }
          }
        }
      }

      memberGoals.push({
        date: date,
        goals: goalsForDay,
      });
    }
    return memberGoals;
  }

  function displayGoals(goalsData, name) {
    resultsDiv.innerHTML = "";
    if (goalsData.length === 0) {
      resultsDiv.innerHTML = `<p class="text-gray-600">No goals found for <strong>${name}</strong> for the current month.</p>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    const title = document.createElement("h2");
    title.className = "text-xl font-semibold text-gray-700 mb-4";
    title.innerHTML = `Goals for <span class="text-blue-600">${name}</span>`;
    fragment.appendChild(title);

    goalsData.forEach(({ date, goals }) => {
      const dayContainer = document.createElement("div");
      dayContainer.className =
        "p-4 bg-white rounded-lg shadow-sm border border-gray-200 mb-3";

      const dateEl = document.createElement("h3");
      dateEl.className = "font-semibold text-md text-gray-800 mb-2";
      dateEl.textContent = date;
      dayContainer.appendChild(dateEl);

      const ul = document.createElement("ul");
      ul.className = "list-disc list-inside space-y-1 text-gray-600 text-sm";

      if (goals.includes("X")) {
        const li = document.createElement("li");
        li.className = "text-gray-500 italic";
        li.textContent = "X";
        ul.appendChild(li);
      } else if (goals.length === 0) {
        const li = document.createElement("li");
        li.className = "text-gray-500 italic";
        li.textContent = "No goals recorded";
        ul.appendChild(li);
      } else {
        goals.forEach((goalText) => {
          const li = document.createElement("li");
          li.textContent = goalText;
          ul.appendChild(li);
        });
      }
      dayContainer.appendChild(ul);
      fragment.appendChild(dayContainer);
    });

    resultsDiv.appendChild(fragment);
  }

  function displayError(message) {
    resultsDiv.innerHTML = `<p class="text-red-600 bg-red-100 p-3 rounded-md">${message}</p>`;
  }

  function exportToCsv(data, name) {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Goals\n";

    let lastKnownGoals = [];

    data.forEach((item) => {
      let goalsToUse = [];

      if (item.goals.includes("X")) {
        goalsToUse = ["X"];
      } else if (item.goals.length > 0) {
        goalsToUse = item.goals;
        lastKnownGoals = [...item.goals];
      } else {
        goalsToUse = [...lastKnownGoals];
      }

      let goalsString;
      if (goalsToUse.includes("X")) {
        goalsString = "X";
      } else if (goalsToUse.length === 0) {
        goalsString = "No goals";
      } else {
        goalsString = goalsToUse
          .map((goal) => goal.replace(/"/g, '""'))
          .join(" / ");
      }

      csvContent += `${goalsString}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${name}_goals_daily_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
});
