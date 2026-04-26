import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Desktop navigation
const universitySelect = document.getElementById('universitySelect');
const facultyDropdownContainer = document.getElementById('facultyDropdownContainer');
const facultySelect = document.getElementById('facultySelect');
const semesterDropdownContainer = document.getElementById('semesterDropdownContainer');
const semesterSelect = document.getElementById('semesterSelect');

// Mobile navigation
const universitySelectMobile = document.getElementById('universitySelectMobile');
const facultySelectMobile = document.getElementById('facultySelectMobile');
const semesterSelectMobile = document.getElementById('semesterSelectMobile');

// Load universities
async function loadUniversities() {
    try {
        const querySnapshot = await getDocs(collection(db, 'universities'));
        
        querySnapshot.forEach((doc) => {
            // Desktop
            if (universitySelect) {
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = doc.data().name;
                universitySelect.appendChild(option);
            }
            
            // Mobile
            if (universitySelectMobile) {
                const optionMobile = document.createElement('option');
                optionMobile.value = doc.id;
                optionMobile.textContent = doc.data().name;
                universitySelectMobile.appendChild(optionMobile);
            }
        });
    } catch (error) {
        console.error('Error loading universities:', error);
    }
}

// Handle university change - Desktop
if (universitySelect) {
    universitySelect.addEventListener('change', async (e) => {
        const universityId = e.target.value;
        
        facultySelect.innerHTML = '<option value="">Select Faculty</option>';
        semesterDropdownContainer.style.display = 'none';
        
        if (universityId) {
            facultyDropdownContainer.style.display = 'block';
            await loadFaculties(universityId, facultySelect);
        } else {
            facultyDropdownContainer.style.display = 'none';
        }
    });
}

// Handle university change - Mobile
if (universitySelectMobile) {
    universitySelectMobile.addEventListener('change', async (e) => {
        const universityId = e.target.value;
        
        facultySelectMobile.innerHTML = '<option value="">Select Faculty</option>';
        semesterSelectMobile.style.display = 'none';
        
        if (universityId) {
            facultySelectMobile.style.display = 'block';
            await loadFaculties(universityId, facultySelectMobile);
        } else {
            facultySelectMobile.style.display = 'none';
        }
    });
}

// Handle faculty change - Desktop
if (facultySelect) {
    facultySelect.addEventListener('change', async (e) => {
        const facultyId = e.target.value;
        
        semesterSelect.innerHTML = '<option value="">Select Semester</option>';
        
        if (facultyId) {
            semesterDropdownContainer.style.display = 'block';
            await loadSemesters(facultyId, semesterSelect);
        } else {
            semesterDropdownContainer.style.display = 'none';
        }
    });
}

// Handle faculty change - Mobile
if (facultySelectMobile) {
    facultySelectMobile.addEventListener('change', async (e) => {
        const facultyId = e.target.value;
        
        semesterSelectMobile.innerHTML = '<option value="">Select Semester</option>';
        
        if (facultyId) {
            semesterSelectMobile.style.display = 'block';
            await loadSemesters(facultyId, semesterSelectMobile);
        } else {
            semesterSelectMobile.style.display = 'none';
        }
    });
}

// Load faculties
async function loadFaculties(universityId, selectElement) {
    try {
        const q = query(collection(db, 'faculties'), where('universityId', '==', universityId));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().name;
            selectElement.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading faculties:', error);
    }
}

// Load semesters
async function loadSemesters(facultyId, selectElement) {
    try {
        const q = query(collection(db, 'semesters'), where('facultyId', '==', facultyId));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().name;
            selectElement.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading semesters:', error);
    }
}

// Initialize on page load
loadUniversities();