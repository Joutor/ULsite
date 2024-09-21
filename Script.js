let z = 1;
let a = 1000;
let b = 10000;

function plus() {
	a = 1000;
	b = 10000;
	z = z + 1;
	a = a * z;
	b = b * z;

	document.getElementById("demo").innerHTML = a + " ₽ / " + z + " Ч";
	document.getElementById("demo_2").innerHTML = b + " ₽ / " + z + " Ч";
	document.getElementById("demo_1").innerHTML = z;
}

function minus() {
	a = 1000;
	b = 10000;
	z = z - 1;
	a = a * z;
	b = b * z;

	if (z == 0) {
		z = 1;
		a = 1000;
		b = 10000;
	}

	document.getElementById("demo").innerHTML = a + " ₽ / " + z + " Ч";
	document.getElementById("demo_2").innerHTML = b + " ₽ / " + z + " Ч";
	document.getElementById("demo_1").innerHTML = z;
}
