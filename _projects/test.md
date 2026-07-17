---
layout: subpage
title: Test animation
date: 2026-07-17
categories: [Theoretical Physics, Computational Methods]
description: An interactive 3D simulation of spin precession in a uniform magnetic field.
libraries: 
  - "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
scripts: 
  - "spin-animation.js"
---
When a particle with a magnetic dipole moment is placed in a static magnetic field $\vec{B}$, it experiences a torque that aligns it toward the field. However, due to conservation of angular momentum, the spin vector $\vec{S}$ precesses around the field axis at a characteristic rate known as the **Larmor frequency**:

$$\omega_0 = \gamma B_0$$

Below is a live interactive simulation of Larmor precession. The blue vector represents the external magnetic field oriented along the Z/Y-axis, while the orange vector represents the precessing spin. 

You can interactively alter the **axis of precession** ($\theta$) using the slider below:

{% include visualisations/precessing-spin.html %}

As you adjust the angle toward $90^\circ$, notice how the radius of the trajectory ring expands to its maximum diameter, representing a state orthogonal to the applied magnetic field.

**The above text is AI generated**
