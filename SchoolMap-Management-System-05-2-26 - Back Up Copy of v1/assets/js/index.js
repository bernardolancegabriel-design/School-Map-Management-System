/* =========================================================
   SCHOOLMAP — index.js
   Landing page specific code
   ========================================================= */

"use strict";

var FAQ_ITEMS = [
  { q: "How do I navigate the map?",      a: "Click 'Explore as Guest' on the home page to open the interactive map. You can zoom in/out, switch floors, and click any location pin to see its details.", color: "#192A57" },
  { q: "How do I find a specific room?",   a: "Use the search bar at the top of the map page to search by room name or number. You can also use the 'From' and 'To' dropdowns to get route directions.", color: "#8F3347" },
  { q: "What do the colored pins mean?",   a: "Each color represents a different type of location. The legend panel on the left shows all color codes: blue for classrooms, maroon for offices, etc.", color: "#C24322" },
  { q: "How do I create an account?",      a: "Click 'Sign In to Continue' on the home page, then click 'Register' to create a new account. You can register as a Student, Faculty, or Visitor.", color: "#2d5da1" },
  { q: "I'm an admin. How do I edit?",     a: "Log in with an admin account. You'll see an 'Admin Panel' option in the user menu. From there you can add floors, locations, and customize the legend.", color: "#b45309" },
  { q: "Is SchoolMap available on mobile?",a: "Yes! SchoolMap is fully responsive. You can access it from any smartphone, tablet, or desktop browser.", color: "#15803d" }
];

document.addEventListener("DOMContentLoaded", function() {
  buildFAQList();
});

function buildFAQList() {
  var container = document.getElementById("faq-list");
  if (!container) { return; }
  var html = "";
  var bgColors = ["#ffffff", "#F8E9D8", "#ffffff", "#F8E9D8", "#fff9c4", "#ffffff"];
  for (var i = 0; i < FAQ_ITEMS.length; i++) {
    var item = FAQ_ITEMS[i];
    var rotation = (i % 3 === 0) ? "rotate-n1" : (i % 3 === 1) ? "rotate-1" : "";
    var decoration = (i % 2 === 0) ? "tack-decoration" : "tape-decoration";
    html += '<div class="faq-item ' + decoration + ' ' + rotation + '" style="background:' + bgColors[i] + '">';
    html += '<p class="faq-q" style="color:' + item.color + '">Q: ' + escHtml(item.q) + '</p>';
    html += '<p class="faq-a">✏ ' + escHtml(item.a) + '</p>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function toggleMobileMenu() {
  var nav = document.getElementById("mobile-nav");
  var menuIcon  = document.getElementById("menu-icon");
  var closeIcon = document.getElementById("close-icon");
  if (!nav) { return; }
  var isOpen = nav.style.display !== "none";
  nav.style.display = isOpen ? "none" : "";
  if (menuIcon)  { menuIcon.style.display  = isOpen ? "" : "none"; }
  if (closeIcon) { closeIcon.style.display = isOpen ? "none" : ""; }
}
