(() => {
    const element = document.getElementById("create");
    element.addEventListener("click", (event) => {
        console.log(event.target);
        event.target.disabled = true;
        fetch("/client", {
            method: "POST",
        }).then((response) => {
            if (response.redirected) {
                window.location.href = response.url;
            } else {
                event.target.disabled = false;
            }
        }).catch(() => {
            event.target.disabled = false;
        });
    });
})();
