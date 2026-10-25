package org.example.backend.runner;

import org.example.backend.entity.User;
import org.example.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Profile;

@Component
@Profile({"dev", "local", "qa"})
public class DataFixerRunner7 implements CommandLineRunner {

    @Autowired
    private UserRepository userRepository;

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        System.out.println("=== Running DataFixerRunner7 (Update User Emails) ===");

        List<User> users = userRepository.findAll();
        int count = 0;

        for (User user : users) {
            String email = user.getEmail();
            if (email != null && email.endsWith("@orca.local")) {
                String fullName = user.getFullName();
                if (fullName != null && !fullName.isEmpty()) {
                    String newEmail = normalizeName(fullName) + "@gmail.com";
                    
                    // Check if email already exists to avoid unique constraint violations
                    // If it exists, append a number
                    String finalEmail = newEmail;
                    int suffix = 1;
                    while (emailExists(users, finalEmail, user.getId())) {
                        finalEmail = normalizeName(fullName) + suffix + "@gmail.com";
                        suffix++;
                    }
                    
                    user.setEmail(finalEmail);
                    userRepository.save(user);
                    count++;
                }
            }
        }

        System.out.println("=== DataFixerRunner7 finished. Updated " + count + " users ===");
    }

    private boolean emailExists(List<User> users, String email, UUID currentUserId) {
        return users.stream().anyMatch(u -> u.getEmail() != null && u.getEmail().equals(email) && !u.getId().equals(currentUserId));
    }

    private String normalizeName(String name) {
        // Remove leading/trailing spaces and multiple spaces
        name = name.trim().replaceAll("\\s+", " ");
        // Convert to lowercase
        name = name.toLowerCase();
        // Remove accents
        String temp = Normalizer.normalize(name, Normalizer.Form.NFD);
        Pattern pattern = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");
        name = pattern.matcher(temp).replaceAll("");
        // Replace special Vietnamese characters not handled by NFD (đ)
        name = name.replace("đ", "d");
        // Remove spaces
        name = name.replace(" ", "");
        // Remove any non-alphanumeric characters just in case
        name = name.replaceAll("[^a-z0-9]", "");
        return name;
    }
}
